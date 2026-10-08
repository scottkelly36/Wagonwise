import {
  planCompanyParamsSchema,
  scheduleCapacityRequestSchema,
  setPriceRequestSchema,
  updateBillingDetailsRequestSchema,
} from '@wagonwise/contracts/billing';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScopes } from '../../../shared/ports/data-scope.js';
import {
  getBillingDetails,
  updateBillingDetails,
  type BillingDetailsDeps,
  type BillingDetailsView,
} from '../application/billing-details.js';
import type { CallerDirectory } from '../application/ports/directories.js';
import type { InvoiceDeps } from '../application/invoices.js';
import { registerInvoiceRoutes } from './invoice-routes.js';
import { registerFinanceRoutes } from './finance-routes.js';
import type { FinanceDeps } from '../application/finance.js';
import { registerOwnBillingRoutes } from './own-routes.js';
import type { OwnBillingDeps } from '../application/own-billing.js';
import type { Outcome } from './outcome.js';
import {
  capacityHistory,
  listPlans,
  scheduleCapacity,
  setPricePerVehicle,
  type PlanDeps,
} from '../application/plans.js';

export interface BillingRouteDeps {
  readonly billing: BillingDetailsDeps;
  readonly plans: PlanDeps;
  readonly invoices: InvoiceDeps;
  readonly finance: FinanceDeps;
  readonly own: OwnBillingDeps;
  readonly callerDirectory: CallerDirectory;
  /** Row-Level Security scope per request (migration 0039): billing data is platform-only. */
  readonly dataScopes: DataScopes;
}

function dto(view: BillingDetailsView) {
  return {
    ...view.details,
    placeholders: view.placeholders,
    updatedAt: view.updatedAt.toISOString(),
  };
}

/**
 * WagonWise's own billing details (the trading name, address and bank details printed on invoices).
 * Staff door only, and WagonWise admins only: the use case refuses anyone else, and Row-Level Security
 * would not show them the row either.
 */
export function registerBillingRoutes(app: FastifyInstance, deps: BillingRouteDeps): void {
  async function asStaff(
    request: FastifyRequest,
    reply: FastifyReply,
    work: (staffId: string) => Promise<Outcome>,
  ) {
    if (request.staffId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const staffId = request.staffId;
    const caller = await deps.callerDirectory.getCaller(makeId<'StaffId'>(staffId));
    // A company's staff, or a removed account: the same refusal, with no hint the page exists.
    if (caller?.kind !== 'platform') {
      return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    }
    const outcome = await deps.dataScopes.run({ kind: 'platform' }, () => work(staffId));
    const body = outcome.status >= 400 ? { ...outcome.body, requestId: request.id } : outcome.body;
    return reply.status(outcome.status).send(body);
  }

  app.get('/staff/billing/details', (request, reply) =>
    asStaff(request, reply, async () => {
      const result = await getBillingDetails(deps.billing, { kind: 'platform' });
      return result.ok
        ? { status: 200, body: dto(result.value) }
        : { status: 403, body: result.error };
    }),
  );

  app.put('/staff/billing/details', (request, reply) =>
    asStaff(request, reply, async (staffId) => {
      const body = updateBillingDetailsRequestSchema.safeParse(request.body);
      if (!body.success) return { status: 400, body: { error: 'invalid_request' } };
      const result = await updateBillingDetails(
        deps.billing,
        { kind: 'platform' },
        makeId<'StaffId'>(staffId),
        body.data,
      );
      if (result.ok) return { status: 200, body: dto(result.value) };
      return result.error.tag === 'Forbidden'
        ? { status: 403, body: result.error }
        : { status: 400, body: result.error };
    }),
  );

  // What each company pays for: the price per vehicle and the capacity the plan covers.
  type PlanError =
    | { readonly tag: 'Forbidden' }
    | { readonly tag: 'CompanyNotFound' }
    | { readonly tag: 'InvalidPrice' | 'InvalidCapacity' | 'InvalidDay' | 'DayInPast' };
  const planFailure = (error: PlanError) => ({
    status: error.tag === 'Forbidden' ? 403 : error.tag === 'CompanyNotFound' ? 404 : 400,
    body: error,
  });
  const badRequest = { status: 400, body: { error: 'invalid_request' } };

  app.get('/staff/billing/companies', (request, reply) =>
    asStaff(request, reply, async () => {
      const result = await listPlans(deps.plans, { kind: 'platform' });
      if (!result.ok) return planFailure(result.error);
      return {
        status: 200,
        body: {
          plans: result.value.map((p) => ({
            companyId: p.companyId,
            name: p.name,
            pricePerVehiclePence: p.pricePerVehiclePence,
            capacityToday: p.capacityToday,
            ...(p.next === undefined ? {} : { next: p.next }),
            monthlyPence: p.monthlyPence,
          })),
        },
      };
    }),
  );

  app.get('/staff/billing/companies/:companyId/capacity', (request, reply) =>
    asStaff(request, reply, async () => {
      const params = planCompanyParamsSchema.safeParse(request.params);
      if (!params.success) return badRequest;
      const result = await capacityHistory(
        deps.plans,
        { kind: 'platform' },
        makeId<'CompanyId'>(params.data.companyId),
      );
      return result.ok
        ? {
            status: 200,
            body: {
              changes: result.value.map((c) => ({
                effectiveFrom: c.effectiveFrom,
                capacity: c.capacity,
              })),
            },
          }
        : planFailure(result.error);
    }),
  );

  app.put('/staff/billing/companies/:companyId/price', (request, reply) =>
    asStaff(request, reply, async (staffId) => {
      const params = planCompanyParamsSchema.safeParse(request.params);
      const body = setPriceRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return badRequest;
      const result = await setPricePerVehicle(
        deps.plans,
        { kind: 'platform' },
        makeId<'StaffId'>(staffId),
        makeId<'CompanyId'>(params.data.companyId),
        body.data.pricePerVehiclePence,
      );
      return result.ok
        ? { status: 200, body: { pricePerVehiclePence: result.value } }
        : planFailure(result.error);
    }),
  );

  app.post('/staff/billing/companies/:companyId/capacity', (request, reply) =>
    asStaff(request, reply, async (staffId) => {
      const params = planCompanyParamsSchema.safeParse(request.params);
      const body = scheduleCapacityRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return badRequest;
      const result = await scheduleCapacity(
        deps.plans,
        { kind: 'platform' },
        makeId<'StaffId'>(staffId),
        makeId<'CompanyId'>(params.data.companyId),
        body.data,
      );
      return result.ok
        ? {
            status: 201,
            body: { effectiveFrom: result.value.effectiveFrom, capacity: result.value.capacity },
          }
        : planFailure(result.error);
    }),
  );

  registerInvoiceRoutes(app, deps.invoices, asStaff);
  registerFinanceRoutes(app, deps.finance, asStaff);
  registerOwnBillingRoutes(app, {
    own: deps.own,
    callerDirectory: deps.callerDirectory,
    dataScopes: deps.dataScopes,
  });
}
