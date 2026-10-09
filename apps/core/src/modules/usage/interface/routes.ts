import type { FastifyInstance } from 'fastify';
import type { DataScopes } from '../../../shared/ports/data-scope.js';
import {
  firmsActiveThisWeek,
  getUsage,
  type CallerDirectory,
  type UsageDeps,
  type UsageReport,
} from '../application/usage.js';

export interface UsageRouteDeps {
  readonly usage: UsageDeps;
  readonly callerDirectory: CallerDirectory;
  readonly dataScopes: DataScopes;
}

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

const toDto = (r: UsageReport) => ({
  generatedAt: r.generatedAt.toISOString(),
  drivers: r.drivers,
  staff: r.staff,
  firms: { total: r.firms.length, activeThisWeek: firmsActiveThisWeek(r.firms, r.generatedAt) },
  devices: { total: r.devices },
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
}
