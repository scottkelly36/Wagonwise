import { costingCompanyParamsSchema, jobCostsQuerySchema } from '@wagonwise/contracts/costing';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import type { Forbidden } from '../application/inputs.js';
import {
  jobCostReport,
  type InvalidMonth,
  type JobCostReportDeps,
} from '../application/job-cost-report.js';
import type { CallerDirectory, StaffCaller } from '../application/ports.js';

export interface CostingReportRouteDeps {
  readonly report: JobCostReportDeps;
  readonly callerDirectory: CallerDirectory;
  readonly dataScopes: DataScopes;
}

interface Outcome {
  readonly status: number;
  readonly body?: object;
}
const INVALID: Outcome = { status: 400, body: { error: 'invalid_request' } };
const failure = (error: Forbidden | InvalidMonth): Outcome => ({
  status: error.tag === 'Forbidden' ? 403 : 400,
  body: error,
});

const scopeFor = (caller: StaffCaller): DataScope =>
  caller.kind === 'platform'
    ? { kind: 'platform' }
    : { kind: 'company', companyId: caller.companyId };

/**
 * The cost of a month's jobs for the dashboard. It reads wages, so it needs `manage_billing` (checked in the use case);
 * Row-Level Security refuses another company's rows.
 */
export function registerCostingReportRoutes(
  app: FastifyInstance,
  deps: CostingReportRouteDeps,
): void {
  async function asStaff(
    request: FastifyRequest,
    reply: FastifyReply,
    work: (caller: StaffCaller) => Promise<Outcome>,
  ) {
    if (request.staffId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const caller = await deps.callerDirectory.getCaller(makeId<'StaffId'>(request.staffId));
    const outcome =
      caller === null
        ? { status: 403, body: { tag: 'Forbidden' } }
        : await deps.dataScopes.run(scopeFor(caller), () => work(caller));
    const body = outcome.status >= 400 ? { ...outcome.body, requestId: request.id } : outcome.body;
    return reply.status(outcome.status).send(body);
  }

  app.get('/staff/costing/companies/:companyId/job-costs', (request, reply) =>
    asStaff(request, reply, async (caller) => {
      const params = costingCompanyParamsSchema.safeParse(request.params);
      const query = jobCostsQuerySchema.safeParse(request.query);
      if (!params.success || !query.success) return INVALID;
      const result = await jobCostReport(
        deps.report,
        caller,
        makeId<'CompanyId'>(params.data.companyId),
        query.data.month,
      );
      if (!result.ok) return failure(result.error);
      const r = result.value;
      return {
        status: 200,
        body: {
          month: r.month,
          jobs: r.jobs.map((j) => ({
            jobId: j.jobId,
            reference: j.reference,
            ...(j.customer === undefined ? {} : { customer: j.customer }),
            ...(j.vehicleName === undefined ? {} : { vehicleName: j.vehicleName }),
            ...(j.driverName === undefined ? {} : { driverName: j.driverName }),
            deliveredAt: j.deliveredAt.toISOString(),
            hours: j.hours,
            ...(j.pricePence === undefined ? {} : { pricePence: j.pricePence }),
            ...(j.wagesPence === undefined ? {} : { wagesPence: j.wagesPence }),
            fuelPence: j.fuelPence,
            runningPence: j.runningPence,
            costPence: j.costPence,
            ...(j.profitPence === undefined ? {} : { profitPence: j.profitPence }),
            notes: j.notes,
          })),
          vehicles: r.vehicles.map((v) => ({
            ...(v.vehicleId === undefined ? {} : { vehicleId: v.vehicleId }),
            name: v.name,
            jobs: v.jobs,
            hours: v.hours,
            revenuePence: v.revenuePence,
            wagesPence: v.wagesPence,
            fuelPence: v.fuelPence,
            runningPence: v.runningPence,
            costPence: v.costPence,
            profitPence: v.profitPence,
          })),
          customers: r.customers,
          totals: r.totals,
        },
      };
    }),
  );
}
