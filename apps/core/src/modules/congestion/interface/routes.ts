import {
  findNearbyCongestionRequestSchema,
  reportCongestionRequestSchema,
} from '@wagonwise/contracts/congestion';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import {
  findNearbyCongestion,
  type FindNearbyCongestionDeps,
} from '../application/find-nearby-congestion.js';
import { reportCongestion, type ReportCongestionDeps } from '../application/report-congestion.js';
import { statusFor } from './error-mapping.js';

export interface CongestionRouteDeps {
  readonly reportCongestion: ReportCongestionDeps;
  readonly findNearbyCongestion: FindNearbyCongestionDeps;
}

/** Duplicated from hazards'/routing's own `requireDriverId` rather than shared — a module is
 *  reachable only through its facade (AGENTS.md rule 6), and there's no shared declaration small
 *  enough to be worth a new one. */
function requireDriverId(request: FastifyRequest, reply: FastifyReply): Id<'DriverId'> | undefined {
  if (request.driverId === undefined) {
    void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    return undefined;
  }
  return makeId<'DriverId'>(request.driverId);
}

/**
 * Reachable only by a trusted caller via `X-Internal-Key` (host/internal-auth.ts) *and* a
 * verified access token (host/driver-auth.ts, gated on `/congestion/` from the start, unlike
 * hazards' phased-in M4.3). Phase 1 only (docs/progress.md): crowd-sourced reporting and reading
 * back what's nearby — no WebTRIS ingestion (phase 2) and no route-line coloring (phase 3) yet.
 */
export function registerCongestionRoutes(app: FastifyInstance, deps: CongestionRouteDeps): void {
  app.post('/congestion/reports', async (request, reply) => {
    const reporterId = requireDriverId(request, reply);
    if (reporterId === undefined) return reply;

    const parsed = reportCongestionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await reportCongestion(deps.reportCongestion, {
      id: makeId<'CongestionReportId'>(parsed.data.id),
      reporterId,
      location: parsed.data.location,
      estimatedWaitMinutes: parsed.data.estimatedWaitMinutes,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(result.value);
  });

  // No requireDriverId call — reading congestion for the map isn't scoped to a reporter, though
  // the host's driver-auth hook still requires some verified driver behind the whole
  // `/congestion/` prefix. POST rather than GET, same reasoning as hazards' own nearby route: a
  // route-corridor query needs a points array in the body.
  app.post('/congestion/reports/nearby', async (request, reply) => {
    const parsed = findNearbyCongestionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const reports = await findNearbyCongestion(deps.findNearbyCongestion, {
      corridor: parsed.data.corridor,
      radiusM: parsed.data.radiusM,
    });
    return reply.status(200).send({ reports });
  });
}
