import {
  addCostRequestSchema,
  changeCostRequestSchema,
  costIdParamsSchema,
  financeQuerySchema,
  stopCostRequestSchema,
} from '@wagonwise/contracts/billing';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import {
  addCost,
  changeCost,
  deleteCost,
  financeReport,
  stopCost,
  type CostNotFound,
  type FinanceDeps,
} from '../application/finance.js';
import type { Forbidden } from '../application/billing-details.js';
import type { InvalidCost, InvalidCostChange, Cost } from '../domain/finance.js';
import type { InvalidMonth } from '../domain/invoice.js';
import type { Outcome } from './outcome.js';

type AsStaff = (
  request: FastifyRequest,
  reply: FastifyReply,
  work: (staffId: string) => Promise<Outcome>,
) => Promise<FastifyReply>;

type FinanceError = Forbidden | CostNotFound | InvalidCost | InvalidMonth | InvalidCostChange;

function statusFor(error: FinanceError): number {
  switch (error.tag) {
    case 'Forbidden':
      return 403;
    case 'CostNotFound':
      return 404;
    case 'InvalidCost':
    case 'InvalidMonth':
      return 400;
    case 'InvalidCostChange':
      return 409;
  }
}

const failure = (error: FinanceError): Outcome => ({ status: statusFor(error), body: error });
const badRequest: Outcome = { status: 400, body: { error: 'invalid_request' } };

const costDto = (c: Cost) => ({
  id: c.id,
  category: c.category,
  description: c.description,
  amountPence: c.amountPence,
  fromMonth: c.fromMonth,
  ...(c.toMonth === undefined ? {} : { toMonth: c.toMonth }),
});

/**
 * WagonWise's own finances: the costs an admin enters (each carrying on until changed or stopped) and the report that
 * sets them against what the companies are invoiced. WagonWise admins only; `asStaff` has already refused anyone
 * else, every use case checks again, and Row-Level Security would not show them the rows.
 */
export function registerFinanceRoutes(
  app: FastifyInstance,
  deps: FinanceDeps,
  asStaff: AsStaff,
): void {
  const admin = { kind: 'platform' } as const;

  app.get('/staff/billing/finance', (request, reply) =>
    asStaff(request, reply, async () => {
      const query = financeQuerySchema.safeParse(request.query);
      if (!query.success) return badRequest;
      const result = await financeReport(deps, admin, query.data.month);
      if (!result.ok) return failure(result.error);
      const r = result.value;
      return {
        status: 200,
        body: {
          months: r.months,
          month: r.month,
          currentMonth: r.currentMonth,
          costs: r.costs.map(costDto),
          revenueByCompany: r.revenueByCompany,
          projection: r.projection,
        },
      };
    }),
  );

  app.post('/staff/billing/costs', (request, reply) =>
    asStaff(request, reply, async (staffId) => {
      const body = addCostRequestSchema.safeParse(request.body);
      if (!body.success) return badRequest;
      const result = await addCost(deps, admin, makeId<'StaffId'>(staffId), body.data);
      return result.ok ? { status: 201, body: costDto(result.value) } : failure(result.error);
    }),
  );

  app.put('/staff/billing/costs/:id', (request, reply) =>
    asStaff(request, reply, async (staffId) => {
      const params = costIdParamsSchema.safeParse(request.params);
      const body = changeCostRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return badRequest;
      const result = await changeCost(
        deps,
        admin,
        makeId<'StaffId'>(staffId),
        makeId<'CostId'>(params.data.id),
        body.data,
      );
      return result.ok ? { status: 200, body: costDto(result.value) } : failure(result.error);
    }),
  );

  app.post('/staff/billing/costs/:id/stop', (request, reply) =>
    asStaff(request, reply, async () => {
      const params = costIdParamsSchema.safeParse(request.params);
      const body = stopCostRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return badRequest;
      const result = await stopCost(
        deps,
        admin,
        makeId<'CostId'>(params.data.id),
        body.data.fromMonth,
      );
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );

  app.delete('/staff/billing/costs/:id', (request, reply) =>
    asStaff(request, reply, async () => {
      const params = costIdParamsSchema.safeParse(request.params);
      if (!params.success) return badRequest;
      const result = await deleteCost(deps, admin, makeId<'CostId'>(params.data.id));
      return result.ok ? { status: 204 } : failure(result.error);
    }),
  );
}
