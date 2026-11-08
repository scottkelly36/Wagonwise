import { auditPackQuerySchema, auditVehicleParamsSchema } from '@wagonwise/contracts/audit';
import type { FastifyInstance } from 'fastify';
import {
  getVehicleAuditPack,
  type AuditDeps,
  type CallerDirectory,
} from '../application/audit-pack.js';
import type { AuditPack } from '../domain/audit-pack.js';

export interface AuditRouteDeps {
  readonly audit: AuditDeps;
  readonly callerDirectory: CallerDirectory;
}

const iso = (d: Date): string => d.toISOString();
const opt = <K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } =>
  (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };

function packDto(
  vehicle: {
    id: string;
    name: string;
    registration: string | undefined;
    company: string | undefined;
  },
  p: AuditPack,
) {
  return {
    vehicle: {
      id: vehicle.id,
      name: vehicle.name,
      ...opt('registration', vehicle.registration),
      ...opt('company', vehicle.company),
    },
    range: p.range,
    generatedAt: iso(p.generatedAt),
    summary: p.summary,
    checks: p.checks.map((c) => ({ ...c, submittedAt: iso(c.submittedAt) })),
    defects: p.defects.map((d) => ({
      id: d.id,
      foundAt: iso(d.foundAt),
      foundBy: d.foundBy,
      item: d.item,
      severity: d.severity,
      detail: d.detail,
      ...opt('note', d.note),
      status: d.status,
      ...opt('lastChangeAt', d.lastChangeAt === undefined ? undefined : iso(d.lastChangeAt)),
      ...opt('lastChangeBy', d.lastChangeBy),
      history: d.history.map((h) => ({ status: h.status, at: iso(h.at), ...opt('by', h.by) })),
      ...(d.repair === undefined
        ? {}
        : {
            repair: {
              title: d.repair.title,
              dueDate: d.repair.dueDate,
              status: d.repair.status,
              ...opt('doneOn', d.repair.doneOn),
              ...opt('note', d.repair.note),
              ...opt('bookedBy', d.repair.bookedBy),
              ...opt('finishedBy', d.repair.finishedBy),
            },
          }),
    })),
    maintenance: {
      items: p.maintenance.items.map((i) => ({
        name: i.name,
        dueDate: i.dueDate,
        ...opt('lastDone', i.lastDone),
        state: i.state,
      })),
      done: p.maintenance.done.map((d) => ({
        item: d.item,
        doneOn: d.doneOn,
        nextDue: d.nextDue,
        ...opt('note', d.note),
        ...opt('by', d.by),
        recordedAt: iso(d.recordedAt),
      })),
      changes: p.maintenance.changes.map((c) => ({
        item: c.item,
        ...opt('from', c.from),
        to: c.to,
        at: iso(c.at),
        ...opt('by', c.by),
      })),
    },
    timeline: p.timeline.map((e) => ({
      at: iso(e.at),
      kind: e.kind,
      title: e.title,
      ...opt('detail', e.detail),
      ...opt('who', e.who),
    })),
  };
}

const STATUS = { Forbidden: 403, NotFound: 404, InvalidRange: 400 } as const;

/**
 * The audit pack for one vehicle (the staff dashboard's Audit pack page). Read-only. The use case checks the caller's own
 * permission and runs the read in their data scope, so Row-Level Security refuses another company's rows too.
 */
export function registerAuditRoutes(app: FastifyInstance, deps: AuditRouteDeps): void {
  app.get('/staff/audit/vehicles/:vehicleId', async (request, reply) => {
    if (request.staffId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const params = auditVehicleParamsSchema.safeParse(request.params);
    const query = auditPackQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const caller = await deps.callerDirectory.getCaller(request.staffId);
    if (caller === null) return reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
    const result = await getVehicleAuditPack(deps.audit, caller, params.data.vehicleId, query.data);
    if (!result.ok) {
      return reply
        .status(STATUS[result.error.tag])
        .send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(packDto(result.value.vehicle, result.value.pack));
  });
}
