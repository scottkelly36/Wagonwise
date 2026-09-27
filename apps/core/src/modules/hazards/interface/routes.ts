import {
  findNearbyHazardsRequestSchema,
  hazardReportIdParamsSchema,
  parseVoiceHazardReportRequestSchema,
  reportHazardRequestSchema,
} from '@wagonwise/contracts/hazards';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import { confirmHazard, type ConfirmHazardDeps } from '../application/confirm-hazard.js';
import { deleteHazard, type DeleteHazardDeps } from '../application/delete-hazard.js';
import { dismissHazard, type DismissHazardDeps } from '../application/dismiss-hazard.js';
import type { AdminDirectory } from '../application/ports/admin-directory.js';
import {
  findNearbyHazards,
  type FindNearbyHazardsDeps,
} from '../application/find-nearby-hazards.js';
import { getHazard, type GetHazardDeps } from '../application/get-hazard.js';
import { listHazards, type ListHazardsDeps } from '../application/list-hazards.js';
import { parseVoiceReport, type ParseVoiceReportDeps } from '../application/parse-voice-report.js';
import { reportHazard, type ReportHazardDeps } from '../application/report-hazard.js';
import { statusFor } from './error-mapping.js';

export interface HazardsRouteDeps {
  readonly reportHazard: ReportHazardDeps;
  readonly confirmHazard: ConfirmHazardDeps;
  readonly dismissHazard: DismissHazardDeps;
  readonly deleteHazard: DeleteHazardDeps;
  /** Gates `DELETE /hazards/reports/:id` — unlike confirm/dismiss (decision 63), a true delete is
   *  not open to every driver. */
  readonly adminDirectory: AdminDirectory;
  readonly getHazard: GetHazardDeps;
  readonly listHazards: ListHazardsDeps;
  readonly parseVoiceReport: ParseVoiceReportDeps;
  readonly findNearbyHazards: FindNearbyHazardsDeps;
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

  // No requireDriverId call — same reasoning as confirm/dismiss below (decision 63): reading
  // hazards for the map isn't scoped to a reporter, though the host's driver-auth hook still
  // requires some verified driver behind the whole /hazards/ prefix. POST rather than GET since
  // a route-corridor query needs a points array in the body, not a query string (mirrors the
  // read-with-a-body shape of a "search" endpoint more than a plain resource fetch).
  app.post('/hazards/reports/nearby', async (request, reply) => {
    const parsed = findNearbyHazardsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const hazards = await findNearbyHazards(deps.findNearbyHazards, {
      corridor: parsed.data.corridor,
      radiusM: parsed.data.radiusM,
    });
    return reply.status(200).send({ hazards });
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

  /**
   * True removal, unlike confirm/dismiss — a genuinely destructive, unrecoverable action, so
   * unlike decision 63's "no ownership check at all" it's gated to admin accounts only
   * (field-testing request, 2026-09-26: "give my account the ability to remove hazards, I've
   * been making some as tests"). `requireDriverId` first (401, same as every other `/hazards/`
   * route), then the admin check (403) — both before even parsing `:id`, so a non-admin never
   * learns whether a given id exists. The 403 body uses `tag` rather than the neighbouring
   * inline checks' `error` field: unlike an auth wiring bug (401) or a malformed request (400),
   * this is a real outcome a driver can hit from the UI, worth a real driver-facing message
   * (lib/error-messages.ts, driver-app) rather than the generic fallback an `error`-shaped body
   * gets there.
   */
  app.delete('/hazards/reports/:id', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    if (!(await deps.adminDirectory.isAdmin(driverId))) {
      return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    }

    const params = hazardReportIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await deleteHazard(deps.deleteHazard, {
      id: makeId<'HazardReportId'>(params.data.id),
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(204).send();
  });

  // The dashboard's Hazard reports admin screen (2026-09-27) — every report, any status,
  // replacing the driver app's own admin-only delete UI (which had no way to browse hazards at
  // all, only ever reachable from a map marker). Admin-gated, same shape as the delete route
  // above; a non-admin gets 403, never a partial list.
  app.get('/hazards/reports', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    if (!(await deps.adminDirectory.isAdmin(driverId))) {
      return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    }

    const hazards = await listHazards(deps.listHazards);
    return reply.status(200).send({ hazards });
  });
}
