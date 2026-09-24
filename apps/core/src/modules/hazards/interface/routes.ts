import {
  hazardReportIdParamsSchema,
  parseVoiceHazardReportRequestSchema,
  reportHazardRequestSchema,
} from '@wagonwise/contracts/hazards';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import { confirmHazard, type ConfirmHazardDeps } from '../application/confirm-hazard.js';
import { dismissHazard, type DismissHazardDeps } from '../application/dismiss-hazard.js';
import { getHazard, type GetHazardDeps } from '../application/get-hazard.js';
import { parseVoiceReport, type ParseVoiceReportDeps } from '../application/parse-voice-report.js';
import { reportHazard, type ReportHazardDeps } from '../application/report-hazard.js';
import { statusFor } from './error-mapping.js';

export interface HazardsRouteDeps {
  readonly reportHazard: ReportHazardDeps;
  readonly confirmHazard: ConfirmHazardDeps;
  readonly dismissHazard: DismissHazardDeps;
  readonly getHazard: GetHazardDeps;
  readonly parseVoiceReport: ParseVoiceReportDeps;
}

/**
 * `reporterId` never comes from a body field a caller supplied — `request.driverId` is set by
 * `host/driver-auth.ts`'s hook, which must run before this handler (wired in `compose-core.ts`,
 * M4.3). Mirrors routing's own `requireDriverId` (`routing/interface/routes.ts`) — duplicated
 * rather than shared, since a module is reachable only through its facade (AGENTS.md rule 6) and
 * there's no shared declaration small enough to be worth a new one.
 */
function requireDriverId(request: FastifyRequest, reply: FastifyReply): Id<'DriverId'> | undefined {
  if (request.driverId === undefined) {
    // Only reachable if this route were ever registered without host/driver-auth.ts's hook in
    // front of it — a wiring bug, not a request shape a driver can trigger. Fails closed.
    void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    return undefined;
  }
  return makeId<'DriverId'>(request.driverId);
}

/**
 * Reachable only by a trusted caller via `X-Internal-Key` (host/internal-auth.ts) *and* a
 * verified access token (host/driver-auth.ts, gated on `/hazards/` as of M4.3). Confirm/dismiss
 * don't read `request.driverId` at all — decision 63: community moderation has no ownership
 * check, any authenticated driver may confirm or dismiss any report — but the driver-auth hook
 * still requires *some* verified driver behind every hazards route, confirm/dismiss included.
 */
export function registerHazardsRoutes(app: FastifyInstance, deps: HazardsRouteDeps): void {
  app.post('/hazards/reports', async (request, reply) => {
    const reporterId = requireDriverId(request, reply);
    if (reporterId === undefined) return reply;

    const parsed = reportHazardRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await reportHazard(deps.reportHazard, {
      id: makeId<'HazardReportId'>(parsed.data.id),
      reporterId,
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

  // No requireDriverId call — parsing a transcript isn't scoped to a reporter at all, and (like
  // confirm/dismiss below) the host's driver-auth hook already requires some verified driver
  // behind the whole /hazards/ prefix regardless.
  app.post('/hazards/voice-reports/parse', async (request, reply) => {
    const parsed = parseVoiceHazardReportRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await parseVoiceReport(deps.parseVoiceReport, {
      transcript: parsed.data.transcript,
    });
    return reply.status(200).send(result);
  });

  // No requireDriverId call — same reasoning as confirm/dismiss below (decision 63): a hazard
  // report is community data with no ownership check, though the host's driver-auth hook still
  // requires some verified driver behind the whole /hazards/ prefix (driver-auth.test.ts).
  app.get('/hazards/reports/:id', async (request, reply) => {
    const params = hazardReportIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await getHazard(deps.getHazard, {
      id: makeId<'HazardReportId'>(params.data.id),
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
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
