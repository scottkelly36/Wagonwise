import {
  addInvoiceLineRequestSchema,
  generateInvoicesRequestSchema,
  invoiceIdParamsSchema,
  invoiceLineParamsSchema,
} from '@wagonwise/contracts/billing';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import {
  addManualLine,
  deleteDraft,
  generateInvoices,
  getInvoice,
  issueInvoice,
  listInvoices,
  markInvoicePaid,
  removeLine,
  voidInvoice,
  type InvoiceDeps,
} from '../application/invoices.js';
import {
  totalPence,
  type BillingDetailsIncomplete,
  type InvalidInvoiceState,
  type InvalidLine,
  type InvalidMonth,
  type Invoice,
  type InvoiceNotFound,
  type NegativeTotal,
} from '../domain/invoice.js';
import type { EmptyInvoice, Forbidden, MonthNotStarted } from '../application/invoices.js';
import type { Outcome } from './outcome.js';

type AsStaff = (
  request: FastifyRequest,
  reply: FastifyReply,
  work: (staffId: string) => Promise<Outcome>,
) => Promise<FastifyReply>;

export function invoiceDto(invoice: Invoice) {
  return {
    id: invoice.id,
    companyId: invoice.companyId,
    companyName: invoice.companyName,
    month: invoice.month,
    status: invoice.status,
    ...(invoice.number === undefined ? {} : { number: invoice.number }),
    lines: invoice.lines.map((l) => ({
      id: l.id,
      description: l.description,
      quantity: l.quantity,
      unitPence: l.unitPence,
      amountPence: l.amountPence,
    })),
    totalPence: totalPence(invoice.lines),
    createdAt: invoice.createdAt.toISOString(),
    ...(invoice.issuedAt === undefined ? {} : { issuedAt: invoice.issuedAt.toISOString() }),
    ...(invoice.paidAt === undefined ? {} : { paidAt: invoice.paidAt.toISOString() }),
    ...(invoice.voidedAt === undefined ? {} : { voidedAt: invoice.voidedAt.toISOString() }),
    ...(invoice.issuedDetails === undefined ? {} : { issuedDetails: invoice.issuedDetails }),
  };
}

type InvoiceError =
  | Forbidden
  | InvoiceNotFound
  | InvalidMonth
  | InvalidLine
  | MonthNotStarted
  | InvalidInvoiceState
  | BillingDetailsIncomplete
  | EmptyInvoice
  | NegativeTotal;

function statusFor(error: InvoiceError): number {
  switch (error.tag) {
    case 'Forbidden':
      return 403;
    case 'InvoiceNotFound':
      return 404;
    case 'InvalidMonth':
    case 'InvalidLine':
    case 'MonthNotStarted':
      return 400;
    // The invoice is not in a state that allows this, or issuing is not possible yet.
    case 'InvalidInvoiceState':
    case 'BillingDetailsIncomplete':
    case 'EmptyInvoice':
    case 'NegativeTotal':
      return 409;
  }
}

const failure = (error: InvoiceError): Outcome => ({ status: statusFor(error), body: error });
const badRequest: Outcome = { status: 400, body: { error: 'invalid_request' } };

/**
 * Invoices: draft the month's, adjust a draft, issue it (numbering and freezing it), mark it paid or void it.
 * WagonWise admins only (`asStaff` has already refused everyone else, and Row-Level Security would not show
 * them the rows); every use case checks the caller again.
 */
export function registerInvoiceRoutes(
  app: FastifyInstance,
  deps: InvoiceDeps,
  asStaff: AsStaff,
): void {
  const admin = { kind: 'platform' } as const;
  const invoiceId = (params: unknown) => {
    const parsed = invoiceIdParamsSchema.safeParse(params);
    return parsed.success ? makeId<'InvoiceId'>(parsed.data.id) : undefined;
  };
  const one = (
    result: { ok: true; value: Invoice } | { ok: false; error: InvoiceError },
  ): Outcome =>
    result.ok ? { status: 200, body: invoiceDto(result.value) } : failure(result.error);

  app.get('/staff/billing/invoices', (request, reply) =>
    asStaff(request, reply, async () => {
      const result = await listInvoices(deps, admin);
      return result.ok
        ? { status: 200, body: { invoices: result.value.map(invoiceDto) } }
        : failure(result.error);
    }),
  );

  app.post('/staff/billing/invoices/generate', (request, reply) =>
    asStaff(request, reply, async (staffId) => {
      const body = generateInvoicesRequestSchema.safeParse(request.body);
      if (!body.success) return badRequest;
      const result = await generateInvoices(
        deps,
        admin,
        makeId<'StaffId'>(staffId),
        body.data.month,
      );
      return result.ok
        ? {
            status: 201,
            body: { created: result.value.created.map(invoiceDto), skipped: result.value.skipped },
          }
        : failure(result.error);
    }),
  );

  app.get('/staff/billing/invoices/:id', (request, reply) =>
    asStaff(request, reply, async () => {
      const id = invoiceId(request.params);
      return id === undefined ? badRequest : one(await getInvoice(deps, admin, id));
    }),
  );

  app.post('/staff/billing/invoices/:id/lines', (request, reply) =>
    asStaff(request, reply, async () => {
      const id = invoiceId(request.params);
      const body = addInvoiceLineRequestSchema.safeParse(request.body);
      if (id === undefined || !body.success) return badRequest;
      return one(await addManualLine(deps, admin, id, body.data));
    }),
  );

  app.delete('/staff/billing/invoices/:id/lines/:lineId', (request, reply) =>
    asStaff(request, reply, async () => {
      const params = invoiceLineParamsSchema.safeParse(request.params);
      if (!params.success) return badRequest;
      return one(
        await removeLine(
          deps,
          admin,
          makeId<'InvoiceId'>(params.data.id),
          makeId<'InvoiceLineId'>(params.data.lineId),
        ),
      );
    }),
  );

  app.post('/staff/billing/invoices/:id/issue', (request, reply) =>
    asStaff(request, reply, async () => {
      const id = invoiceId(request.params);
      return id === undefined ? badRequest : one(await issueInvoice(deps, admin, id));
    }),
  );

  app.post('/staff/billing/invoices/:id/paid', (request, reply) =>
    asStaff(request, reply, async () => {
      const id = invoiceId(request.params);
      return id === undefined ? badRequest : one(await markInvoicePaid(deps, admin, id));
    }),
  );

  app.post('/staff/billing/invoices/:id/void', (request, reply) =>
    asStaff(request, reply, async () => {
      const id = invoiceId(request.params);
      return id === undefined ? badRequest : one(await voidInvoice(deps, admin, id));
    }),
  );

  app.delete('/staff/billing/invoices/:id', (request, reply) =>
    asStaff(request, reply, async () => {
      const id = invoiceId(request.params);
      if (id === undefined) return badRequest;
      const result = await deleteDraft(deps, admin, id);
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );
}
