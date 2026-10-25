import {
  cancelSosRequestSchema,
  listSosQuerySchema,
  raiseSosRequestSchema,
  sosIdParamsSchema,
} from '@wagonwise/contracts/sos';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScopes } from '../../../shared/ports/data-scope.js';
import {
  cancelSos,
  listSos,
  raiseSos,
  resolveSos,
  sendAlertEmails,
  sendCancelledEmails,
  type MailDeps,
  type SosDeps,
} from '../application/sos.js';
import type { CallerDirectory, DriverIdentityDirectory } from '../application/ports.js';
import type { SosAlert } from '../domain/sos.js';

export interface SosRouteDeps {
  readonly sos: SosDeps;
  readonly mail: MailDeps;
  readonly callerDirectory: CallerDirectory;
  readonly identities: DriverIdentityDirectory;
  /** Row-Level Security scope per request (migration 0077). */
  readonly dataScopes: DataScopes;
}

function alertDto(a: SosAlert) {
  return {
    id: a.id,
    status: a.status,
    ...(a.driverName === undefined ? {} : { driverName: a.driverName }),
    ...(a.driverContact === undefined ? {} : { driverContact: a.driverContact }),
    ...(a.vehicleName === undefined ? {} : { vehicleName: a.vehicleName }),
    ...(a.vehicleRegistration === undefined ? {} : { vehicleRegistration: a.vehicleRegistration }),
    ...(a.jobReference === undefined ? {} : { jobReference: a.jobReference }),
    location: a.location,
    ...(a.words === undefined ? {} : { words: a.words }),
    ...(a.nearestPlace === undefined ? {} : { nearestPlace: a.nearestPlace }),
    createdAt: a.createdAt.toISOString(),
    ...(a.resolvedAt === undefined ? {} : { resolvedAt: a.resolvedAt.toISOString() }),
  };
}

/**
 * SOS. The driver's door (`/sos/*`, a driver token, the `driver` data scope) raises and cancels; the office's door (`/staff/sos/*`,
 * a staff token) lists and resolves. The office is emailed after the driver's data scope has closed, because looking up who to
 * email opens its own; and a failed email never fails the SOS (the alert is stored and shows in the portal).
 */
export function registerSosRoutes(app: FastifyInstance, deps: SosRouteDeps): void {
  const invalid = (request: FastifyRequest, reply: FastifyReply) =>
    reply.status(400).send({ error: 'invalid_request', requestId: request.id });

  async function driverScope(request: FastifyRequest, reply: FastifyReply) {
    if (request.driverId === undefined) {
      await reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
      return undefined;
    }
    const driverId = makeId<'DriverId'>(request.driverId);
    const identifier = await deps.identities.getIdentifier(driverId);
    if (identifier === null) {
      await reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
      return undefined;
    }
    return { driverId, identifier };
  }

  app.post('/sos/raise', async (request, reply) => {
    const who = await driverScope(request, reply);
    if (who === undefined) return reply;
    const parsed = raiseSosRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(request, reply);
    const raised = await deps.dataScopes.run(
      { kind: 'driver', driverId: who.driverId, identifier: who.identifier },
      () =>
        raiseSos(deps.sos, {
          driverId: who.driverId,
          identifier: who.identifier,
          requestId: parsed.data.requestId,
          location: parsed.data.location,
        }),
    );
    try {
      await sendAlertEmails(deps.mail, raised.made);
    } catch (error) {
      request.log.warn({ err: error }, 'sos: emailing the office failed');
    }
    return reply.status(200).send({
      requestId: raised.requestId,
      location: raised.location,
      ...(raised.words === undefined ? {} : { words: raised.words }),
      ...(raised.nearestPlace === undefined ? {} : { nearestPlace: raised.nearestPlace }),
      notified: raised.notified,
    });
  });

  app.post('/sos/cancel', async (request, reply) => {
    const who = await driverScope(request, reply);
    if (who === undefined) return reply;
    const parsed = cancelSosRequestSchema.safeParse(request.body);
    if (!parsed.success) return invalid(request, reply);
    const cancelled = await deps.dataScopes.run(
      { kind: 'driver', driverId: who.driverId, identifier: who.identifier },
      () => cancelSos(deps.sos, { driverId: who.driverId, requestId: parsed.data.requestId }),
    );
    try {
      await sendCancelledEmails(deps.mail, cancelled);
    } catch (error) {
      request.log.warn({ err: error }, 'sos: emailing the cancellation failed');
    }
    return reply.status(204).send();
  });

  async function staffCaller(request: FastifyRequest, reply: FastifyReply) {
    if (request.staffId === undefined) {
      await reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
      return undefined;
    }
    const staffId = makeId<'StaffId'>(request.staffId);
    const caller = await deps.callerDirectory.getCaller(staffId);
    if (caller === null) {
      await reply.status(403).send({ tag: 'Forbidden', requestId: request.id });
      return undefined;
    }
    return { staffId, caller };
  }

  app.get('/staff/sos', async (request, reply) => {
    const who = await staffCaller(request, reply);
    if (who === undefined) return reply;
    const query = listSosQuerySchema.safeParse(request.query);
    if (!query.success) return invalid(request, reply);
    const scope =
      who.caller.kind === 'platform'
        ? ({ kind: 'platform' } as const)
        : ({ kind: 'company', companyId: who.caller.companyId } as const);
    const result = await deps.dataScopes.run(scope, () =>
      listSos(deps.sos, { actor: who.caller, status: query.data.status }),
    );
    return result.ok
      ? reply.status(200).send({ alerts: result.value.map(alertDto) })
      : reply.status(403).send({ ...result.error, requestId: request.id });
  });

  app.post('/staff/sos/:id/resolve', async (request, reply) => {
    const who = await staffCaller(request, reply);
    if (who === undefined) return reply;
    const params = sosIdParamsSchema.safeParse(request.params);
    if (!params.success) return invalid(request, reply);
    const scope =
      who.caller.kind === 'platform'
        ? ({ kind: 'platform' } as const)
        : ({ kind: 'company', companyId: who.caller.companyId } as const);
    const result = await deps.dataScopes.run(scope, () =>
      resolveSos(deps.sos, {
        actor: who.caller,
        staffId: who.staffId,
        id: makeId<'SosAlertId'>(params.data.id),
      }),
    );
    if (result.ok) return reply.status(204).send();
    return reply
      .status(result.error.tag === 'Forbidden' ? 403 : 404)
      .send({ ...result.error, requestId: request.id });
  });
}
