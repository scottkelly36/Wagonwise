import {
  createFleetVehicleRequestSchema,
  driverLinkIdParamsSchema,
  fleetCompanyIdParamsSchema,
  fleetVehicleIdParamsSchema,
  inviteDriverRequestSchema,
  updateFleetVehicleRequestSchema,
} from '@wagonwise/contracts/fleet';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import {
  getCompanyCode,
  regenerateCompanyCode,
  type CompanyCodeDeps,
} from '../application/company-code.js';
import {
  createFleetVehicle,
  type CreateFleetVehicleDeps,
} from '../application/create-fleet-vehicle.js';
import {
  deleteFleetVehicle,
  type DeleteFleetVehicleDeps,
} from '../application/delete-fleet-vehicle.js';
import { inviteDriver, type InviteDriverDeps } from '../application/invite-driver.js';
import { listCompanyDriverLinks } from '../application/list-driver-links.js';
import {
  listFleetVehicles,
  type ListFleetVehiclesDeps,
} from '../application/list-fleet-vehicles.js';
import type { Caller, CallerDirectory } from '../application/ports/caller-directory.js';
import type { DriverIdentityDirectory } from '../application/ports/directories.js';
import type { DriverLinkRepository } from '../application/ports/driver-link-repository.js';
import {
  approveDriverRequest,
  declineDriverLink,
  removeDriver,
  type SettleDriverLinkDeps,
} from '../application/settle-driver-link.js';
import {
  updateFleetVehicle,
  type UpdateFleetVehicleDeps,
} from '../application/update-fleet-vehicle.js';
import type { DriverId, DriverLink } from '../domain/driver-link.js';
import type { FleetVehicle } from '../domain/vehicle.js';
import { statusFor } from './error-mapping.js';

export interface FleetRouteDeps {
  readonly createFleetVehicle: CreateFleetVehicleDeps;
  readonly updateFleetVehicle: UpdateFleetVehicleDeps;
  readonly deleteFleetVehicle: DeleteFleetVehicleDeps;
  readonly listFleetVehicles: ListFleetVehiclesDeps;
  readonly inviteDriver: InviteDriverDeps;
  readonly listDriverLinks: { readonly links: Pick<DriverLinkRepository, 'listForCompany'> };
  readonly settleDriverLink: SettleDriverLinkDeps;
  readonly companyCode: CompanyCodeDeps;
  /** Driver identifiers for showing staff who a requested or active link belongs to
   *  (P2-M2.6; invitations already carry their own `invitedIdentifier`). */
  readonly driverIdentities: DriverIdentityDirectory;
  /** Resolves who's calling, for the use cases' own permission checks
   *  (`application/authorization.ts`) and for the request's RLS scope. */
  readonly callerDirectory: CallerDirectory;
  /** Row-Level Security scope per request (P2-M1.7, migration 0021). */
  readonly dataScopes: DataScopes;
}

function vehicleDto(vehicle: FleetVehicle) {
  return {
    id: vehicle.id,
    companyId: vehicle.companyId,
    name: vehicle.name,
    dimensions: vehicle.dimensions,
  };
}

/** Driver identifiers for every `driverId` among `links`, for `driverLinkDto`. One lookup per
 *  distinct driver rather than per link. */
async function identifiersFor(
  identities: DriverIdentityDirectory,
  links: readonly DriverLink[],
): Promise<ReadonlyMap<DriverId, string>> {
  const driverIds = [...new Set(links.flatMap((link) => (link.driverId ? [link.driverId] : [])))];
  const pairs = await Promise.all(
    driverIds.map(async (id) => [id, await identities.getIdentifier(id)] as const),
  );
  return new Map(pairs.filter((pair): pair is [DriverId, string] => pair[1] !== null));
}

function driverLinkDto(link: DriverLink, identifiers: ReadonlyMap<DriverId, string>) {
  return {
    id: link.id,
    companyId: link.companyId,
    ...(link.driverId === undefined ? {} : { driverId: link.driverId }),
    ...(link.driverId !== undefined && identifiers.has(link.driverId)
      ? { driverIdentifier: identifiers.get(link.driverId) }
      : {}),
    ...(link.invitedIdentifier === undefined ? {} : { invitedIdentifier: link.invitedIdentifier }),
    status: link.status,
    createdAt: link.createdAt.toISOString(),
    ...(link.decidedAt === undefined ? {} : { decidedAt: link.decidedAt.toISOString() }),
  };
}

/** The signed-in staff member, from `host/staff-auth.ts` (P2-M1.12c: fleet moved from driver
 *  tokens to staff tokens). 401 if there isn't one. */
function requireStaffId(request: FastifyRequest, reply: FastifyReply): Id<'StaffId'> | undefined {
  if (request.staffId === undefined) {
    void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    return undefined;
  }
  return makeId<'StaffId'>(request.staffId);
}

/** What a handler decided, sent only after its scope's transaction has committed. */
interface Outcome {
  readonly status: number;
  readonly body?: object;
}

function send(request: FastifyRequest, reply: FastifyReply, outcome: Outcome) {
  if (outcome.body === undefined) return reply.status(outcome.status).send();
  const body = outcome.status >= 400 ? { ...outcome.body, requestId: request.id } : outcome.body;
  return reply.status(outcome.status).send(body);
}

const INVALID: Outcome = { status: 400, body: { error: 'invalid_request' } };
const FORBIDDEN: Outcome = { status: 403, body: { tag: 'Forbidden' } };

/** WagonWise admins see every company's fleet; a company's staff only their own company's. */
function scopeFor(caller: Caller): DataScope {
  return caller.kind === 'platform'
    ? { kind: 'platform' }
    : { kind: 'company', companyId: caller.companyId };
}

/**
 * Fleet vehicles are company-scoped business data (Phase 2 tech design doc §3/§4): nobody sees
 * another company's fleet. Every route resolves the signed-in staff member via `callerDirectory`
 * (P2-M1.12c; `companies` owns staff accounts, AGENTS.md rule 7); `requireStaffId` (401) always
 * runs first. The permission checks themselves
 * (403, or 404 for a vehicle in a company the caller can't see) are the use cases' own
 * (P2-M1.8, `application/authorization.ts`).
 *
 * P2-M1.7: the vehicle reads and writes run inside the caller's `DataScopes` scope, so Postgres
 * Row-Level Security enforces the same company boundary a second time.
 */
export function registerFleetRoutes(app: FastifyInstance, deps: FleetRouteDeps): void {
  /** The caller, and the scope their fleet work runs in, or the 403 to send instead. */
  async function callerAndScope(
    staffId: Id<'StaffId'>,
  ): Promise<{ caller: Caller; scope: DataScope } | undefined> {
    const caller = await deps.callerDirectory.getCaller(staffId);
    return caller ? { caller, scope: scopeFor(caller) } : undefined;
  }

  app.get('/staff/fleet/companies/:companyId/vehicles', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const params = fleetCompanyIdParamsSchema.safeParse(request.params);
    if (!params.success) return send(request, reply, INVALID);
    const who = await callerAndScope(staffId);
    if (!who) return send(request, reply, FORBIDDEN);

    const outcome = await deps.dataScopes.run(who.scope, async (): Promise<Outcome> => {
      const result = await listFleetVehicles(deps.listFleetVehicles, {
        caller: who.caller,
        companyId: makeId<'CompanyId'>(params.data.companyId),
      });
      if (!result.ok) return { status: statusFor(result.error), body: result.error };
      return { status: 200, body: { vehicles: result.value.map(vehicleDto) } };
    });
    return send(request, reply, outcome);
  });

  app.post('/staff/fleet/companies/:companyId/vehicles', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const params = fleetCompanyIdParamsSchema.safeParse(request.params);
    const body = createFleetVehicleRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return send(request, reply, INVALID);
    const who = await callerAndScope(staffId);
    if (!who) return send(request, reply, FORBIDDEN);

    const outcome = await deps.dataScopes.run(who.scope, async (): Promise<Outcome> => {
      const result = await createFleetVehicle(deps.createFleetVehicle, {
        caller: who.caller,
        companyId: makeId<'CompanyId'>(params.data.companyId),
        name: body.data.name,
        dimensions: body.data.dimensions,
      });
      if (!result.ok) return { status: statusFor(result.error), body: result.error };
      return { status: 201, body: vehicleDto(result.value) };
    });
    return send(request, reply, outcome);
  });

  app.put('/staff/fleet/vehicles/:id', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const params = fleetVehicleIdParamsSchema.safeParse(request.params);
    const body = updateFleetVehicleRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return send(request, reply, INVALID);
    const who = await callerAndScope(staffId);
    if (!who) return send(request, reply, FORBIDDEN);

    const outcome = await deps.dataScopes.run(who.scope, async (): Promise<Outcome> => {
      const result = await updateFleetVehicle(deps.updateFleetVehicle, {
        caller: who.caller,
        id: makeId<'FleetVehicleId'>(params.data.id),
        name: body.data.name,
        dimensions: body.data.dimensions,
      });
      if (!result.ok) return { status: statusFor(result.error), body: result.error };
      return { status: 200, body: vehicleDto(result.value) };
    });
    return send(request, reply, outcome);
  });

  app.delete('/staff/fleet/vehicles/:id', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const params = fleetVehicleIdParamsSchema.safeParse(request.params);
    if (!params.success) return send(request, reply, INVALID);
    const who = await callerAndScope(staffId);
    if (!who) return send(request, reply, FORBIDDEN);

    const outcome = await deps.dataScopes.run(who.scope, async (): Promise<Outcome> => {
      const result = await deleteFleetVehicle(deps.deleteFleetVehicle, {
        caller: who.caller,
        id: makeId<'FleetVehicleId'>(params.data.id),
      });
      if (!result.ok) return { status: statusFor(result.error), body: result.error };
      return { status: 204 };
    });
    return send(request, reply, outcome);
  });

  // ---- Driver links and the company code (P2-M2.6): staff's side of P2-M2.5's driver links.
  // Listing needs only `canViewFleet` (application/authorization.ts), same as vehicles above;
  // inviting, approving, declining, removing and the code (showing it reveals who can join)
  // all need `manage_fleet`. Both are the use cases' own checks, enforced whether or not this
  // file agrees with them.

  app.get('/staff/fleet/companies/:companyId/driver-links', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const params = fleetCompanyIdParamsSchema.safeParse(request.params);
    if (!params.success) return send(request, reply, INVALID);
    const who = await callerAndScope(staffId);
    if (!who) return send(request, reply, FORBIDDEN);

    const outcome = await deps.dataScopes.run(who.scope, async (): Promise<Outcome> => {
      const result = await listCompanyDriverLinks(deps.listDriverLinks, {
        caller: who.caller,
        companyId: makeId<'CompanyId'>(params.data.companyId),
      });
      if (!result.ok) return { status: statusFor(result.error), body: result.error };
      const identifiers = await identifiersFor(deps.driverIdentities, result.value);
      return {
        status: 200,
        body: { links: result.value.map((l) => driverLinkDto(l, identifiers)) },
      };
    });
    return send(request, reply, outcome);
  });

  app.post('/staff/fleet/companies/:companyId/driver-links', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const params = fleetCompanyIdParamsSchema.safeParse(request.params);
    const body = inviteDriverRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return send(request, reply, INVALID);
    const who = await callerAndScope(staffId);
    if (!who) return send(request, reply, FORBIDDEN);

    const outcome = await deps.dataScopes.run(who.scope, async (): Promise<Outcome> => {
      const result = await inviteDriver(deps.inviteDriver, {
        caller: who.caller,
        companyId: makeId<'CompanyId'>(params.data.companyId),
        identifier: body.data.identifier,
      });
      if (!result.ok) return { status: statusFor(result.error), body: result.error };
      return { status: 201, body: driverLinkDto(result.value, new Map()) };
    });
    return send(request, reply, outcome);
  });

  /** `/staff/fleet/driver-links/:id/{approve,decline,remove}`: the link itself carries which
   *  company it belongs to, so unlike the routes above these take no `companyId` — same shape as
   *  `/staff/fleet/vehicles/:id`. An id in a company the caller can't see comes back 404, same as
   *  an unknown one (`settle-driver-link.ts`'s `loadForStaff`). */
  function registerSettleRoute(
    path: string,
    run: (
      deps: SettleDriverLinkDeps,
      input: { caller: Caller; linkId: Id<'DriverLinkId'> },
    ) => ReturnType<typeof approveDriverRequest>,
  ): void {
    app.post(path, async (request, reply) => {
      const staffId = requireStaffId(request, reply);
      if (staffId === undefined) return reply;

      const params = driverLinkIdParamsSchema.safeParse(request.params);
      if (!params.success) return send(request, reply, INVALID);
      const who = await callerAndScope(staffId);
      if (!who) return send(request, reply, FORBIDDEN);

      const outcome = await deps.dataScopes.run(who.scope, async (): Promise<Outcome> => {
        const result = await run(deps.settleDriverLink, {
          caller: who.caller,
          linkId: makeId<'DriverLinkId'>(params.data.id),
        });
        if (!result.ok) return { status: statusFor(result.error), body: result.error };
        const identifiers = await identifiersFor(deps.driverIdentities, [result.value]);
        return { status: 200, body: driverLinkDto(result.value, identifiers) };
      });
      return send(request, reply, outcome);
    });
  }

  registerSettleRoute('/staff/fleet/driver-links/:id/approve', approveDriverRequest);
  registerSettleRoute('/staff/fleet/driver-links/:id/decline', declineDriverLink);
  registerSettleRoute('/staff/fleet/driver-links/:id/remove', removeDriver);

  app.get('/staff/fleet/companies/:companyId/code', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const params = fleetCompanyIdParamsSchema.safeParse(request.params);
    if (!params.success) return send(request, reply, INVALID);
    const who = await callerAndScope(staffId);
    if (!who) return send(request, reply, FORBIDDEN);

    const outcome = await deps.dataScopes.run(who.scope, async (): Promise<Outcome> => {
      const result = await getCompanyCode(deps.companyCode, {
        caller: who.caller,
        companyId: makeId<'CompanyId'>(params.data.companyId),
      });
      if (!result.ok) return { status: statusFor(result.error), body: result.error };
      return { status: 200, body: { code: result.value } };
    });
    return send(request, reply, outcome);
  });

  app.post('/staff/fleet/companies/:companyId/code/regenerate', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const params = fleetCompanyIdParamsSchema.safeParse(request.params);
    if (!params.success) return send(request, reply, INVALID);
    const who = await callerAndScope(staffId);
    if (!who) return send(request, reply, FORBIDDEN);

    const outcome = await deps.dataScopes.run(who.scope, async (): Promise<Outcome> => {
      const result = await regenerateCompanyCode(deps.companyCode, {
        caller: who.caller,
        companyId: makeId<'CompanyId'>(params.data.companyId),
      });
      if (!result.ok) return { status: statusFor(result.error), body: result.error };
      return { status: 200, body: { code: result.value } };
    });
    return send(request, reply, outcome);
  });
}
