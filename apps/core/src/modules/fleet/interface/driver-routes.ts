import {
  driverLinkIdParamsSchema,
  joinWithCodeRequestSchema,
  respondToInvitationRequestSchema,
} from '@wagonwise/contracts/fleet';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import type { DataScopes } from '../../../shared/ports/data-scope.js';
import type { DriverActor } from '../application/driver-actor.js';
import { joinWithCode, type JoinWithCodeDeps } from '../application/join-with-code.js';
import { listMyDriverLinks } from '../application/list-driver-links.js';
import type {
  CompanyNameDirectory,
  DriverIdentityDirectory,
} from '../application/ports/directories.js';
import type { DriverLinkRepository } from '../application/ports/driver-link-repository.js';
import {
  respondToInvitation,
  type RespondToInvitationDeps,
} from '../application/respond-to-invitation.js';
import { leaveFleet, type SettleDriverLinkDeps } from '../application/settle-driver-link.js';
import type { DriverLink } from '../domain/driver-link.js';
import { statusFor, type FleetError } from './error-mapping.js';

export interface FleetDriverRouteDeps {
  readonly links: Pick<DriverLinkRepository, 'listForDriver'>;
  readonly joinWithCode: JoinWithCodeDeps;
  readonly respond: RespondToInvitationDeps;
  readonly settle: SettleDriverLinkDeps;
  readonly identities: DriverIdentityDirectory;
  readonly companyNames: CompanyNameDirectory;
  readonly dataScopes: DataScopes;
}

interface Outcome {
  readonly status: number;
  readonly body: object;
}

const INVALID: Outcome = { status: 400, body: { error: 'invalid_request' } };

function failure(error: FleetError): Outcome {
  return { status: statusFor(error), body: error };
}

/**
 * The driver's side of joining a company (P2-M2.5). Reachable only through `driver-bff`, with a
 * verified driver token (host/driver-auth.ts, gated on `/fleet/`). Every route runs in the
 * driver's own data scope, so Postgres only shows them their own links and the invitations made
 * for their phone or email. The company still decides: nothing here admits a driver on its own.
 */
export function registerFleetDriverRoutes(app: FastifyInstance, deps: FleetDriverRouteDeps): void {
  const dto = (link: DriverLink, names: ReadonlyMap<string, string>) => ({
    id: link.id,
    companyId: link.companyId,
    ...(names.has(link.companyId) ? { companyName: names.get(link.companyId) } : {}),
    ...(link.driverId === undefined ? {} : { driverId: link.driverId }),
    ...(link.invitedIdentifier === undefined ? {} : { invitedIdentifier: link.invitedIdentifier }),
    status: link.status,
    createdAt: link.createdAt.toISOString(),
    ...(link.decidedAt === undefined ? {} : { decidedAt: link.decidedAt.toISOString() }),
  });

  /** Signs the driver in (401), finds their identifier, and runs `work` in their scope. */
  async function asDriver(
    request: FastifyRequest,
    reply: FastifyReply,
    work: (actor: DriverActor) => Promise<Outcome>,
  ) {
    if (request.driverId === undefined) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const driverId = makeId<'DriverId'>(request.driverId);
    const identifier = await deps.identities.getIdentifier(driverId);
    if (identifier === null) {
      return reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    }
    const actor: DriverActor = { kind: 'driver', driverId, identifier };
    const outcome = await deps.dataScopes.run({ kind: 'driver', driverId, identifier }, () =>
      work(actor),
    );
    const body = outcome.status >= 400 ? { ...outcome.body, requestId: request.id } : outcome.body;
    return reply.status(outcome.status).send(body);
  }

  const one = async (link: DriverLink, status: number): Promise<Outcome> => {
    const names = await deps.companyNames.namesFor([link.companyId]);
    return { status, body: dto(link, names) };
  };

  app.get('/fleet/links', (request, reply) =>
    asDriver(request, reply, async (actor) => {
      const links = await listMyDriverLinks(deps, { actor });
      const names = await deps.companyNames.namesFor(links.map((l) => l.companyId));
      return { status: 200, body: { links: links.map((l) => dto(l, names)) } };
    }),
  );

  app.post('/fleet/links/join', (request, reply) =>
    asDriver(request, reply, async (actor) => {
      const body = joinWithCodeRequestSchema.safeParse(request.body);
      if (!body.success) return INVALID;
      const result = await joinWithCode(deps.joinWithCode, { actor, code: body.data.code });
      return result.ok ? one(result.value, 201) : failure(result.error);
    }),
  );

  app.post('/fleet/links/:id/respond', (request, reply) =>
    asDriver(request, reply, async (actor) => {
      const params = driverLinkIdParamsSchema.safeParse(request.params);
      const body = respondToInvitationRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return INVALID;
      const result = await respondToInvitation(deps.respond, {
        actor,
        linkId: makeId<'DriverLinkId'>(params.data.id),
        accept: body.data.accept,
      });
      return result.ok ? one(result.value, 200) : failure(result.error);
    }),
  );

  app.post('/fleet/links/:id/leave', (request, reply) =>
    asDriver(request, reply, async (actor) => {
      const params = driverLinkIdParamsSchema.safeParse(request.params);
      if (!params.success) return INVALID;
      const result = await leaveFleet(deps.settle, {
        actor,
        linkId: makeId<'DriverLinkId'>(params.data.id),
      });
      return result.ok ? one(result.value, 200) : failure(result.error);
    }),
  );
}
