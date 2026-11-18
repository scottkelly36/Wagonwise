import { flowEventsRequestSchema } from '@wagonwise/contracts/usage';
import type { FastifyInstance } from 'fastify';
import type { DataScopes } from '../../../shared/ports/data-scope.js';
import {
  firmsActiveThisWeek,
  getUsage,
  type CallerDirectory,
  type UsageDeps,
  type UsageReport,
} from '../application/usage.js';
import { recordFlowEvents, type FlowEventDeps } from '../application/flow-events.js';

export interface UsageRouteDeps {
  readonly usage: UsageDeps;
  readonly callerDirectory: CallerDirectory;
  readonly dataScopes: DataScopes;
  readonly flowEvents: FlowEventDeps;
}

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

const toDto = (r: UsageReport) => ({
  generatedAt: r.generatedAt.toISOString(),
  drivers: r.drivers,
  staff: r.staff,
  firms: { total: r.firms.length, activeThisWeek: firmsActiveThisWeek(r.firms, r.generatedAt) },
  devices: { total: r.devices },
  funnel: r.funnel,
  newDriversByDay: r.newDriversByDay,
  retentionByWeek: r.retentionByWeek,
  tripsRunningNow: r.tripsRunningNow,
  tripsPerDay: r.tripsPerDay,
  jobsCreatedPerWeek: r.jobsCreatedPerWeek,
  jobsDeliveredPerWeek: r.jobsDeliveredPerWeek,
  checksPerWeek: r.checksPerWeek,
  testers: { total: r.testers },
  firmList: r.firms.map((f) => ({
    id: f.id,
    name: f.name,
    drivers: f.drivers,
    vehicles: f.vehicles,
    staff: f.staff,
    jobsThisMonth: f.jobsThisMonth,
    lastActiveAt: iso(f.lastActiveAt),
  })),
  flows: r.flows,
});

/** `GET /staff/usage`: how the app is being used, for WagonWise staff only (checked here and again in the use case). */
export function registerUsageRoutes(app: FastifyInstance, deps: UsageRouteDeps): void {
  app.get('/staff/usage', async (request, reply) => {
    if (request.staffId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const caller = await deps.callerDirectory.getCaller(request.staffId);
    if (caller === null || caller.kind !== 'platform') {
      return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    }
    const result = await deps.dataScopes.run({ kind: 'platform' }, () =>
      getUsage(deps.usage, caller),
    );
    if (!result.ok) return reply.status(403).send({ ...result.error, requestId: request.id });
    return reply.status(200).send(toDto(result.value));
  });

  /** `POST /usage/flow-events`: a batch of steps and choices from one session of the app. Needs a signed-in driver, so strangers cannot
   *  fill the table, but who it was is not passed on or kept: the events are anonymous (docs/flow-tracking-plan.md). */
  app.post('/usage/flow-events', async (request, reply) => {
    if (request.driverId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const body = flowEventsRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const recorded = await recordFlowEvents(deps.flowEvents, {
      sessionId: body.data.sessionId,
      appVersion: body.data.appVersion,
      platform: body.data.platform,
      updateDate: body.data.updateDate,
      events: body.data.events.map((e) => ({
        event: e.event,
        choice: e.choice,
        at: new Date(e.at),
      })),
    });
    return reply.status(200).send({ recorded });
  });
}
