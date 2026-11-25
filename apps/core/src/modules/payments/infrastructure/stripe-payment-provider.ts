import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentEvent } from '../domain/payment-event.js';
import type { PaymentProvider, ReadEventResult } from '../application/ports/payment-provider.js';

export interface StripePaymentProviderOptions {
  /** `sk_test_…` or `sk_live_…` (or a restricted key with the same rights). Never logged. */
  readonly secretKey: string;
  /** The webhook endpoint's signing secret, `whsec_…`. */
  readonly webhookSecret: string;
  /** Tests substitute a fake; the default is the platform's `fetch`. */
  readonly fetch?: typeof fetch;
  /** How old a signed message may be before it is refused (replay protection). Stripe's own default is five minutes. */
  readonly toleranceSeconds?: number;
}

const API = 'https://api.stripe.com/v1';
const CURRENCY = 'gbp';

/** Stripe's form encoding: nested keys are written `metadata[companyId]`. */
function encode(values: Record<string, string | number | boolean | undefined>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) body.append(key, String(value));
  }
  return body.toString();
}

interface StripeObject {
  readonly id?: string;
  readonly url?: string;
  readonly customer?: string | null;
  readonly mode?: string;
  readonly client_reference_id?: string | null;
  readonly metadata?: Record<string, string> | null;
  readonly amount?: number;
  readonly amount_received?: number;
  readonly last_payment_error?: { readonly message?: string } | null;
  readonly data?: readonly { readonly id: string }[];
}

interface StripeEvent {
  readonly id?: string;
  readonly type?: string;
  readonly data?: { readonly object?: StripeObject };
}

/** What Stripe refused, kept apart from the message so a caller can tell "no such customer" from any other refusal. */
class StripeRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

/**
 * Stripe as the payment provider (docs/company-account-states-scope.md, "Taking payment"). WagonWise uses three parts of it and nothing
 * else: a Customer per company, Checkout in setup mode (Stripe's hosted page, so no card or bank number reaches WagonWise and nothing is
 * charged by it), and a PaymentIntent for each invoice a person asks to collect. Plans and invoices stay in core, so Stripe's Billing
 * and Subscriptions are not used. Which methods the hosted page offers (card, Bacs Direct Debit) is set in the Stripe dashboard.
 *
 * The outcome of a collection arrives by webhook, never in the reply to the request: a Direct Debit takes days. Every webhook is
 * checked against the signing secret before anything in it is read.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  readonly available = true;
  private readonly call: typeof fetch;
  private readonly tolerance: number;

  constructor(private readonly options: StripePaymentProviderOptions) {
    this.call = options.fetch ?? fetch;
    this.tolerance = options.toleranceSeconds ?? 300;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    form?: Record<string, string | number | boolean | undefined>,
    idempotencyKey?: string,
  ): Promise<StripeObject> {
    const response = await this.call(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.options.secretKey}`,
        ...(form === undefined ? {} : { 'content-type': 'application/x-www-form-urlencoded' }),
        ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }),
      },
      ...(form === undefined ? {} : { body: encode(form) }),
      signal: AbortSignal.timeout(15_000),
    });
    const parsed = (await response.json().catch(() => ({}))) as StripeObject & {
      readonly error?: { readonly message?: string; readonly code?: string };
    };
    if (!response.ok) {
      // The message and code only: the request (which carries the key) is never part of the error.
      throw new StripeRequestError(
        `Stripe refused ${method} ${path} (${response.status}): ${parsed.error?.code ?? parsed.error?.message ?? 'no reason given'}`,
        response.status,
        parsed.error?.code,
      );
    }
    return parsed;
  }

  async createSetupSession(input: {
    readonly companyId: string;
    readonly companyName: string;
    readonly returnUrl: string;
    readonly existingRef?: string | null | undefined;
  }): Promise<{ readonly url: string; readonly providerRef: string }> {
    const makeCustomer = async (): Promise<string> => {
      const made = await this.request('POST', '/customers', {
        name: input.companyName,
        'metadata[companyId]': input.companyId,
      });
      if (made.id === undefined) throw new Error('Stripe did not return a customer');
      return made.id;
    };
    const makeSession = (customerId: string) =>
      this.request('POST', '/checkout/sessions', {
        mode: 'setup',
        currency: CURRENCY,
        customer: customerId,
        client_reference_id: input.companyId,
        'metadata[companyId]': input.companyId,
        'setup_intent_data[metadata][companyId]': input.companyId,
        success_url: input.returnUrl,
        cancel_url: input.returnUrl.split('?')[0],
      });
    let customerId = input.existingRef ?? (await makeCustomer());
    let session: StripeObject;
    try {
      session = await makeSession(customerId);
    } catch (error) {
      // The customer kept for this company is not one this Stripe account knows: it was made under the other mode's key (test and
      // live are separate worlds) or was deleted there. Make a fresh one rather than leave the company unable to add details.
      const missing =
        input.existingRef !== null &&
        input.existingRef !== undefined &&
        error instanceof StripeRequestError &&
        error.code === 'resource_missing';
      if (!missing) throw error;
      customerId = await makeCustomer();
      session = await makeSession(customerId);
    }
    if (session.url === undefined) throw new Error('Stripe did not return a page address');
    return { url: session.url, providerRef: customerId };
  }

  async collect(input: {
    readonly companyId: string;
    readonly invoiceId: string;
    readonly invoiceNumber: string | undefined;
    readonly amountPence: number;
    readonly attemptId: string;
    readonly customerRef: string | null;
  }): Promise<{ readonly providerRef: string }> {
    if (input.customerRef === null) throw new Error('no Stripe customer is kept for this company');
    const methods = await this.request(
      'GET',
      `/customers/${encodeURIComponent(input.customerRef)}/payment_methods?limit=1`,
    );
    const method = methods.data?.[0]?.id;
    if (method === undefined) throw new Error('this Stripe customer has no payment method');
    const intent = await this.request(
      'POST',
      '/payment_intents',
      {
        amount: input.amountPence,
        currency: CURRENCY,
        customer: input.customerRef,
        payment_method: method,
        off_session: true,
        'automatic_payment_methods[enabled]': true,
        // Never a redirect: nothing here can send the payer anywhere, so no return address is needed.
        'automatic_payment_methods[allow_redirects]': 'never',
        confirm: true,
        description: `WagonWise invoice ${input.invoiceNumber ?? input.invoiceId}`,
        'metadata[companyId]': input.companyId,
        'metadata[invoiceId]': input.invoiceId,
      },
      // One key per attempt: a repeated request for the same attempt returns the first answer and charges once.
      `wagonwise-collect-${input.attemptId}`,
    );
    if (intent.id === undefined) throw new Error('Stripe did not return a payment');
    return { providerRef: intent.id };
  }

  readEvent(input: {
    readonly body: string;
    readonly signature: string | undefined;
    readonly now: Date;
  }): ReadEventResult {
    if (!this.signedProperly(input.body, input.signature, input.now)) return { ok: false };
    let parsed: StripeEvent;
    try {
      parsed = JSON.parse(input.body) as StripeEvent;
    } catch {
      return { ok: false };
    }
    return { ok: true, event: this.translate(parsed) };
  }

  /** `Stripe-Signature: t=<seconds>,v1=<hex>[,v1=…]`, an HMAC-SHA256 of `t.body` with the signing secret. */
  private signedProperly(body: string, header: string | undefined, now: Date): boolean {
    if (header === undefined) return false;
    let timestamp: string | undefined;
    const candidates: string[] = [];
    for (const part of header.split(',')) {
      const [key, value] = part.split('=');
      if (key?.trim() === 't') timestamp = value?.trim();
      if (key?.trim() === 'v1' && value !== undefined) candidates.push(value.trim());
    }
    if (timestamp === undefined || !/^\d+$/.test(timestamp) || candidates.length === 0)
      return false;
    if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > this.tolerance) return false;
    const expected = createHmac('sha256', this.options.webhookSecret)
      .update(`${timestamp}.${body}`)
      .digest();
    return candidates.some((candidate) => {
      const given = Buffer.from(candidate, 'hex');
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
  }

  /** Stripe's messages in WagonWise's words. Anything else, or anything without the ids WagonWise put on it, is genuine but not acted on. */
  private translate(event: StripeEvent): PaymentEvent | null {
    const id = event.id;
    const object = event.data?.object;
    if (id === undefined || object === undefined) return null;
    const companyId = object.metadata?.companyId;
    const type: string = event.type ?? '';
    switch (type) {
      case 'checkout.session.completed': {
        const company = object.client_reference_id ?? companyId;
        if (object.mode !== 'setup' || company === undefined || company === null) return null;
        return {
          id,
          kind: 'setup_completed',
          companyId: company,
          providerRef: object.customer ?? undefined,
        };
      }
      case 'payment_intent.succeeded': {
        const invoiceId = object.metadata?.invoiceId;
        if (companyId === undefined || invoiceId === undefined) return null;
        return {
          id,
          kind: 'payment_succeeded',
          companyId,
          invoiceId,
          amountPence: object.amount_received ?? object.amount ?? 0,
        };
      }
      case 'payment_intent.payment_failed': {
        const invoiceId = object.metadata?.invoiceId;
        if (companyId === undefined || invoiceId === undefined) return null;
        return {
          id,
          kind: 'payment_failed',
          companyId,
          invoiceId,
          reason: object.last_payment_error?.message,
        };
      }
      default:
        return null;
    }
  }
}
