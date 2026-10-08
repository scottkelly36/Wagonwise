import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScopes } from '../../../shared/ports/data-scope.js';
import { ownInvoices, ownPlan, type OwnBillingDeps } from '../application/own-billing.js';
import type { CallerDirectory, StaffCaller } from '../application/ports/directories.js';
import { invoiceDto } from './invoice-routes.js';
import type { Outcome } from './outcome.js';

export interface OwnBillingRouteDeps {
  readonly own: OwnBillingDeps;
  readonly callerDirectory: CallerDirectory;
  readonly dataScopes: DataScopes;
}

/**
 * A company's own plan and invoices, for the people it has given `manage_billing`. The company is the
 * caller's own, never a parameter, and the work runs in that company's data scope: Postgres would refuse
 * another company's rows, and a draft, even if the application asked for one.
 */
export function registerOwnBillingRoutes(app: FastifyInstance, deps: OwnBillingRouteDeps): void {
  async function asBillingManager(
    request: FastifyRequest,
    reply: FastifyReply,
    work: (caller: StaffCaller) => Promise<Outcome>,
  ) {
    if (request.staffId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const caller = await deps.callerDirectory.getCaller(makeId<'StaffId'>(request.staffId));
    // WagonWise admins use the admin pages, and other staff have no billing: the same refusal for both.
    if (caller?.kind !== 'fleet') {
      return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    }
    const outcome = await deps.dataScopes.run(
      { kind: 'company', companyId: caller.companyId },
      () => work(caller),
    );
    const body = outcome.status >= 400 ? { ...outcome.body, requestId: request.id } : outcome.body;
    return reply.status(outcome.status).send(body);
  }

  app.get('/staff/billing/my/plan', (request, reply) =>
    asBillingManager(request, reply, async (caller) => {
      const result = await ownPlan(deps.own, caller);
      return result.ok
        ? {
            status: 200,
            body: {
              capacityToday: result.value.capacityToday,
              vehiclesInUse: result.value.vehiclesInUse,
              pricePerVehiclePence: result.value.pricePerVehiclePence,
              monthlyPence: result.value.monthlyPence,
              ...(result.value.next === undefined ? {} : { next: result.value.next }),
            },
          }
        : { status: 403, body: result.error };
    }),
  );

  app.get('/staff/billing/my/invoices', (request, reply) =>
    asBillingManager(request, reply, async (caller) => {
      const result = await ownInvoices(deps.own, caller);
      return result.ok
        ? { status: 200, body: { invoices: result.value.map(invoiceDto) } }
        : { status: 403, body: result.error };
    }),
  );
}
