import { updateBillingDetailsRequestSchema } from '@wagonwise/contracts/billing';
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

export interface BillingRouteDeps {
  readonly billing: BillingDetailsDeps;
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
    work: (staffId: string) => Promise<{ status: number; body: object }>,
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
}
