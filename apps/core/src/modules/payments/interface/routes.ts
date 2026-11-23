import {
  collectInvoiceRequestSchema,
  paymentCompanyParamsSchema,
  paymentWebhookRequestSchema,
} from '@wagonwise/contracts/payments';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import {
  collectInvoice,
  getCompanyPayments,
  getOwnPaymentStatus,
  handlePaymentMessage,
  startPaymentSetup,
  type PaymentsDeps,
} from '../application/payments.js';
import type { CallerDirectory, StaffCaller } from '../application/ports/directories.js';

export interface PaymentRouteDeps {
  readonly payments: PaymentsDeps;
  readonly callerDirectory: CallerDirectory;
  readonly dataScopes: DataScopes;
}

const STATUS: Record<string, number> = {
  Forbidden: 403,
  NotAvailable: 409,
  InvoiceNotFound: 404,
  InvoiceNotDue: 409,
  NoPaymentDetails: 409,
  AlreadyCollecting: 409,
  ProviderFailed: 502,
};

/** Tag to HTTP status, in one place (AGENTS.md rule 13). An unlisted tag is a bug: a 500, not a guess. */
function statusFor(error: { readonly tag: string }): number {
  const status = STATUS[error.tag];
  if (status === undefined)
    throw new Error(`no HTTP status mapped for payments error ${error.tag}`);
  return status;
}

/**
 * Payment routes. A company's billing people add payment details (a hosted page at the provider; nothing is charged); WagonWise staff see
 * a company's payments and ask for an invoice to be collected; and the provider's messages arrive at `POST /payments/webhook`, which only
 * the internal key reaches (the public receiver passes them on). Nothing here ever sees a card or bank number.
 */
export function registerPaymentRoutes(app: FastifyInstance, deps: PaymentRouteDeps): void {
  async function caller(request: FastifyRequest, reply: FastifyReply) {
    if (request.staffId === undefined) {
      void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
      return undefined;
    }
    const who = await deps.callerDirectory.getCaller(request.staffId);
    if (who === null) {
      void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
      return undefined;
    }
    return who;
  }
  /** A person works in their own company's scope; WagonWise staff in theirs. */
  const scopeOf = (who: StaffCaller): DataScope =>
    who.kind === 'platform' ? { kind: 'platform' } : { kind: 'company', companyId: who.companyId };
  const failed = (request: FastifyRequest, reply: FastifyReply, error: { readonly tag: string }) =>
    reply.status(statusFor(error)).send({ ...error, requestId: request.id });

  app.get('/staff/payments/status', async (request, reply) => {
    const who = await caller(request, reply);
    if (who === undefined) return reply;
    const result = await deps.dataScopes.run(scopeOf(who), () =>
      getOwnPaymentStatus(deps.payments, who),
    );
    return result.ok ? reply.status(200).send(result.value) : failed(request, reply, result.error);
  });

  app.post('/staff/payments/setup', async (request, reply) => {
    const who = await caller(request, reply);
    if (who === undefined) return reply;
    const result = await deps.dataScopes.run(scopeOf(who), () =>
      startPaymentSetup(deps.payments, who),
    );
    return result.ok ? reply.status(200).send(result.value) : failed(request, reply, result.error);
  });

  app.post('/staff/payments/collect', async (request, reply) => {
    const who = await caller(request, reply);
    if (who === undefined) return reply;
    const body = collectInvoiceRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await deps.dataScopes.run(scopeOf(who), () =>
      collectInvoice(deps.payments, who, body.data.invoiceId),
    );
    return result.ok ? reply.status(200).send(result.value) : failed(request, reply, result.error);
  });

  app.get('/staff/companies/:id/payments', async (request, reply) => {
    const who = await caller(request, reply);
    if (who === undefined) return reply;
    const params = paymentCompanyParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await deps.dataScopes.run(scopeOf(who), () =>
      getCompanyPayments(deps.payments, who, params.data.id),
    );
    if (!result.ok) return failed(request, reply, result.error);
    return reply.status(200).send({
      available: result.value.available,
      detailsOnFile: result.value.detailsOnFile,
      collections: result.value.collections.map((c) => ({
        id: c.id,
        invoiceId: c.invoiceId,
        amountPence: c.amountPence,
        status: c.status,
        requestedAt: c.requestedAt.toISOString(),
        settledAt: c.settledAt?.toISOString() ?? null,
        failureReason: c.failureReason,
      })),
    });
  });

  /**
   * `POST /payments/webhook`: the provider's message, passed on by the public receiver with the exact text and its signature. Refused
   * (401) unless the provider's adapter says it is genuine. Handled in WagonWise staff's scope so an invoice and its company move in one
   * transaction. 204 for everything else, including a message already dealt with, so the provider is not asked to send it again.
   */
  app.post('/payments/webhook', async (request, reply) => {
    const body = paymentWebhookRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const outcome = await deps.dataScopes.run({ kind: 'platform' }, () =>
      handlePaymentMessage(deps.payments, body.data),
    );
    request.log.info({ outcome }, 'payment message');
    if (outcome === 'invalid_signature') {
      return reply.status(401).send({ error: 'invalid_signature', requestId: request.id });
    }
    return reply.status(204).send();
  });
}
