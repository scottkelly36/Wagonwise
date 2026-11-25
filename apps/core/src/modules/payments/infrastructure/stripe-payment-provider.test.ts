import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { StripePaymentProvider } from './stripe-payment-provider.js';

const SECRET = 'whsec_test_secret';
const NOW = new Date('2026-11-24T12:00:00Z');
const T = Math.floor(NOW.getTime() / 1000);

function sign(body: string, t = T, secret = SECRET): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  form: URLSearchParams;
}

/** A stand-in for fetch: answers each call from the queue and records what was sent. */
function fakeStripe(...answers: { status?: number; json: unknown }[]) {
  const calls: Call[] = [];
  const fakeFetch = ((url: string, init: RequestInit) => {
    calls.push({
      method: init.method ?? 'GET',
      url,
      headers: init.headers as Record<string, string>,
      form: new URLSearchParams(typeof init.body === 'string' ? init.body : ''),
    });
    const answer = answers.shift() ?? { json: {} };
    return Promise.resolve(
      new Response(JSON.stringify(answer.json), { status: answer.status ?? 200 }),
    );
  }) as typeof fetch;
  const provider = new StripePaymentProvider({
    secretKey: 'sk_test_abc',
    webhookSecret: SECRET,
    fetch: fakeFetch,
  });
  return { provider, calls };
}

describe('StripePaymentProvider: the hosted setup page', () => {
  it('makes a customer, then a setup-mode Checkout page that comes back to the plan page', async () => {
    const { provider, calls } = fakeStripe(
      { json: { id: 'cus_1' } },
      { json: { id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' } },
    );
    const result = await provider.createSetupSession({
      companyId: 'co-1',
      companyName: 'Test Haulage Co',
      returnUrl: 'https://dashboard.example/staff/plan?payment=done',
    });
    expect(result).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_1', providerRef: 'cus_1' });
    expect(calls[0]?.url).toBe('https://api.stripe.com/v1/customers');
    expect(calls[0]?.form.get('metadata[companyId]')).toBe('co-1');
    expect(calls[0]?.headers.authorization).toBe('Bearer sk_test_abc');
    const session = calls[1]?.form;
    expect(session?.get('mode')).toBe('setup');
    expect(session?.get('customer')).toBe('cus_1');
    expect(session?.get('client_reference_id')).toBe('co-1');
    expect(session?.get('success_url')).toBe('https://dashboard.example/staff/plan?payment=done');
    expect(session?.get('cancel_url')).toBe('https://dashboard.example/staff/plan');
  });

  it('reuses the company’s customer instead of making another', async () => {
    const { provider, calls } = fakeStripe({ json: { id: 'cs_2', url: 'https://x.test/cs_2' } });
    const result = await provider.createSetupSession({
      companyId: 'co-1',
      companyName: 'Test Haulage Co',
      returnUrl: 'https://dashboard.example/staff/plan?payment=done',
      existingRef: 'cus_old',
    });
    expect(result.providerRef).toBe('cus_old');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.stripe.com/v1/checkout/sessions');
  });

  it('makes a fresh customer when the kept one is not known to this Stripe account (made under the other mode, or deleted)', async () => {
    const { provider, calls } = fakeStripe(
      {
        status: 404,
        json: { error: { code: 'resource_missing', message: 'No such customer: cus_old' } },
      },
      { json: { id: 'cus_new' } },
      { json: { id: 'cs_3', url: 'https://x.test/cs_3' } },
    );
    const result = await provider.createSetupSession({
      companyId: 'co-1',
      companyName: 'Test Haulage Co',
      returnUrl: 'https://dashboard.example/staff/plan?payment=done',
      existingRef: 'cus_old',
    });
    expect(result).toEqual({ url: 'https://x.test/cs_3', providerRef: 'cus_new' });
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.stripe.com/v1/checkout/sessions',
      'https://api.stripe.com/v1/customers',
      'https://api.stripe.com/v1/checkout/sessions',
    ]);
    expect(calls[2]?.form.get('customer')).toBe('cus_new');
  });

  it('does not make another customer for any other refusal, and fails once when the new one is refused too', async () => {
    const down = fakeStripe({ status: 500, json: { error: { code: 'api_error' } } });
    await expect(
      down.provider.createSetupSession({
        companyId: 'c',
        companyName: 'n',
        returnUrl: 'https://x.test/a',
        existingRef: 'cus_old',
      }),
    ).rejects.toThrow('api_error');
    expect(down.calls).toHaveLength(1);
    const noRef = fakeStripe(
      { json: { id: 'cus_1' } },
      { status: 404, json: { error: { code: 'resource_missing' } } },
    );
    await expect(
      noRef.provider.createSetupSession({
        companyId: 'c',
        companyName: 'n',
        returnUrl: 'https://x.test/a',
      }),
    ).rejects.toThrow('resource_missing');
    expect(noRef.calls).toHaveLength(2);
  });

  it('says what Stripe refused without repeating the key', async () => {
    const { provider } = fakeStripe({
      status: 401,
      json: {
        error: { code: 'api_key_invalid', message: 'Invalid API Key provided: sk_test_abc' },
      },
    });
    const failure = await provider
      .createSetupSession({ companyId: 'c', companyName: 'n', returnUrl: 'https://x.test/a' })
      .catch((e: Error) => e);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('api_key_invalid');
    expect((failure as Error).message).not.toContain('sk_test');
  });
});

describe('StripePaymentProvider: collecting an invoice', () => {
  const input = {
    companyId: 'co-1',
    invoiceId: 'inv-1',
    invoiceNumber: 'WW-0007',
    amountPence: 1000,
    attemptId: 'attempt-1',
    customerRef: 'cus_1',
  };

  it('charges the saved payment method off session, once per attempt, with the ids on it', async () => {
    const { provider, calls } = fakeStripe(
      { json: { data: [{ id: 'pm_1' }] } },
      { json: { id: 'pi_1' } },
    );
    expect(await provider.collect(input)).toEqual({ providerRef: 'pi_1' });
    expect(calls[0]?.url).toBe('https://api.stripe.com/v1/customers/cus_1/payment_methods?limit=1');
    const intent = calls[1]?.form;
    expect(intent?.get('amount')).toBe('1000');
    expect(intent?.get('currency')).toBe('gbp');
    expect(intent?.get('payment_method')).toBe('pm_1');
    expect(intent?.get('off_session')).toBe('true');
    expect(intent?.get('automatic_payment_methods[enabled]')).toBe('true');
    expect(intent?.get('automatic_payment_methods[allow_redirects]')).toBe('never');
    expect(intent?.get('confirm')).toBe('true');
    expect(intent?.get('metadata[invoiceId]')).toBe('inv-1');
    expect(intent?.get('metadata[companyId]')).toBe('co-1');
    expect(calls[1]?.headers['idempotency-key']).toBe('wagonwise-collect-attempt-1');
  });

  it('refuses without a kept customer or a payment method, so nothing is charged', async () => {
    const none = fakeStripe();
    await expect(none.provider.collect({ ...input, customerRef: null })).rejects.toThrow();
    expect(none.calls).toHaveLength(0);
    const empty = fakeStripe({ json: { data: [] } });
    await expect(empty.provider.collect(input)).rejects.toThrow('no payment method');
    expect(empty.calls).toHaveLength(1);
  });

  it('fails when Stripe declines, so the attempt can be given back', async () => {
    const { provider } = fakeStripe(
      { json: { data: [{ id: 'pm_1' }] } },
      { status: 402, json: { error: { code: 'card_declined' } } },
    );
    await expect(provider.collect(input)).rejects.toThrow('card_declined');
  });
});

describe('StripePaymentProvider: its messages', () => {
  const { provider } = fakeStripe();
  const read = (body: string, signature: string | undefined, now = NOW) =>
    provider.readEvent({ body, signature, now });

  const setup = JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { mode: 'setup', client_reference_id: 'co-1', customer: 'cus_1' } },
  });

  it('refuses a message that is unsigned, mis-signed, signed with another secret, or altered', () => {
    expect(read(setup, undefined)).toEqual({ ok: false });
    expect(read(setup, 'garbage')).toEqual({ ok: false });
    expect(read(setup, sign(setup, T, 'whsec_other'))).toEqual({ ok: false });
    expect(read(`${setup} `, sign(setup))).toEqual({ ok: false });
  });

  it('refuses a message that is too old or from the future, so an old one cannot be replayed', () => {
    expect(read(setup, sign(setup, T - 301))).toEqual({ ok: false });
    expect(read(setup, sign(setup, T + 301))).toEqual({ ok: false });
    expect(read(setup, sign(setup, T - 299))).toMatchObject({ ok: true });
  });

  it('accepts any of several signatures (Stripe sends two while a secret is being rolled)', () => {
    const header = `${sign(setup)},v1=${'0'.repeat(64)}`;
    expect(read(setup, header)).toMatchObject({ ok: true });
  });

  it('reads details added as setup completed, with Stripe’s customer id', () => {
    expect(read(setup, sign(setup))).toEqual({
      ok: true,
      event: { id: 'evt_1', kind: 'setup_completed', companyId: 'co-1', providerRef: 'cus_1' },
    });
  });

  it('reads a paid and a failed payment, in pence, from the ids put on them', () => {
    const paid = JSON.stringify({
      id: 'evt_2',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          amount: 1000,
          amount_received: 1000,
          metadata: { companyId: 'co-1', invoiceId: 'inv-1' },
        },
      },
    });
    expect(read(paid, sign(paid))).toEqual({
      ok: true,
      event: {
        id: 'evt_2',
        kind: 'payment_succeeded',
        companyId: 'co-1',
        invoiceId: 'inv-1',
        amountPence: 1000,
      },
    });
    const failed = JSON.stringify({
      id: 'evt_3',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          metadata: { companyId: 'co-1', invoiceId: 'inv-1' },
          last_payment_error: { message: 'Your card was declined.' },
        },
      },
    });
    expect(read(failed, sign(failed))).toEqual({
      ok: true,
      event: {
        id: 'evt_3',
        kind: 'payment_failed',
        companyId: 'co-1',
        invoiceId: 'inv-1',
        reason: 'Your card was declined.',
      },
    });
  });

  it('knows a genuine message it does not act on (another type, no WagonWise ids, a non-setup Checkout)', () => {
    for (const body of [
      JSON.stringify({ id: 'e', type: 'charge.refunded', data: { object: {} } }),
      JSON.stringify({
        id: 'e',
        type: 'payment_intent.succeeded',
        data: { object: { amount: 5 } },
      }),
      JSON.stringify({
        id: 'e',
        type: 'checkout.session.completed',
        data: { object: { mode: 'payment', client_reference_id: 'co-1' } },
      }),
    ]) {
      expect(read(body, sign(body))).toEqual({ ok: true, event: null });
    }
  });

  it('refuses a signed body that is not JSON', () => {
    expect(read('not json', sign('not json'))).toEqual({ ok: false });
  });
});
