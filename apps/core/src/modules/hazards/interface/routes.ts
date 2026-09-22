import {
  hazardReportIdParamsSchema,
  reportHazardRequestSchema,
} from '@wagonwise/contracts/hazards';
import type { FastifyInstance } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import { confirmHazard, type ConfirmHazardDeps } from '../application/confirm-hazard.js';
import { dismissHazard, type DismissHazardDeps } from '../application/dismiss-hazard.js';
import { reportHazard, type ReportHazardDeps } from '../application/report-hazard.js';
import { statusFor } from './error-mapping.js';

export interface HazardsRouteDeps {
  readonly reportHazard: ReportHazardDeps;
  readonly confirmHazard: ConfirmHazardDeps;
  readonly dismissHazard: DismissHazardDeps;
}

/**
 * Internal endpoints, same trust model as identity's and routing's (design doc §9): reachable
 * only by a trusted BFF via `X-Internal-Key` (host/internal-auth.ts). `reporterId` is a plain
 * request field for now, the same known gap routing's endpoints have (docs/progress.md, M2.2
 * deviations) — closing it is M4's job for every module at once, not this one's alone.
 */
export function registerHazardsRoutes(app: FastifyInstance, deps: HazardsRouteDeps): void {
  app.post('/hazards/reports', async (request, reply) => {
    const parsed = reportHazardRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await reportHazard(deps.reportHazard, {
      id: makeId<'HazardReportId'>(parsed.data.id),
      reporterId: makeId<'DriverId'>(parsed.data.reporterId),
      type: parsed.data.type,
      location: parsed.data.location,
      note: parsed.data.note,
      measurement: parsed.data.measurement,
      source: parsed.data.source,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    // Not always a fresh creation — an idempotent retry or a merge both return 200, since the
    // caller can't tell (and shouldn't need to) which one happened (decision, M3.4).
    return reply.status(200).send(result.value);
  });

  app.post('/hazards/reports/:id/confirm', async (request, reply) => {
    const params = hazardReportIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await confirmHazard(deps.confirmHazard, {
      id: makeId<'HazardReportId'>(params.data.id),
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(result.value);
  });

  app.post('/hazards/reports/:id/dismiss', async (request, reply) => {
    const params = hazardReportIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await dismissHazard(deps.dismissHazard, {
      id: makeId<'HazardReportId'>(params.data.id),
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(result.value);
  });
}
