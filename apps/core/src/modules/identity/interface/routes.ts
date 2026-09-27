import {
  driverIdParamsSchema,
  refreshTokenRequestSchema,
  registerDeviceRequestSchema,
  requestOtpRequestSchema,
  revokeSessionParamsSchema,
  updateDriverRequestSchema,
  verifyOtpRequestSchema,
} from '@wagonwise/contracts/identity';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import { createInviteCode, type CreateInviteCodeDeps } from '../application/create-invite-code.js';
import { deleteAccount, type DeleteAccountDeps } from '../application/delete-account.js';
import { giveConsent, type GiveConsentDeps } from '../application/give-consent.js';
import { listDrivers, type ListDriversDeps } from '../application/list-drivers.js';
import { listInviteCodes, type ListInviteCodesDeps } from '../application/list-invite-codes.js';
import type { DriverRepository } from '../application/ports/driver-repository.js';
import { refreshToken, type RefreshTokenDeps } from '../application/refresh-token.js';
import { registerDevice, type RegisterDeviceDeps } from '../application/register-device.js';
import { requestOtp, type RequestOtpDeps } from '../application/request-otp.js';
import { revokeSession, type RevokeSessionDeps } from '../application/revoke-session.js';
import { updateDriver, type UpdateDriverDeps } from '../application/update-driver.js';
import { verifyOtp, type VerifyOtpDeps } from '../application/verify-otp.js';
import type { TokenSigner } from '../application/ports/token-signer.js';
import { statusFor } from './error-mapping.js';

export interface IdentityRouteDeps {
  readonly requestOtp: RequestOtpDeps;
  readonly verifyOtp: VerifyOtpDeps;
  readonly refreshToken: RefreshTokenDeps;
  readonly revokeSession: RevokeSessionDeps;
  readonly registerDevice: RegisterDeviceDeps;
  readonly giveConsent: GiveConsentDeps;
  readonly deleteAccount: DeleteAccountDeps;
  readonly listDrivers: ListDriversDeps;
  readonly updateDriver: UpdateDriverDeps;
  readonly createInviteCode: CreateInviteCodeDeps;
  readonly listInviteCodes: ListInviteCodesDeps;
  /** The admin check `GET /identity/drivers` and `PATCH /identity/drivers/:id` both need — no
   *  separate `AdminDirectory` port the way other modules need one (2026-09-27's pattern):
   *  identity already *is* the source of truth for `isAdmin`, so this is an in-module read, not a
   *  cross-context one. */
  readonly driverRepo: Pick<DriverRepository, 'findById'>;
  readonly tokenSigner: TokenSigner;
}

function driverDto(driver: {
  readonly id: string;
  readonly identifier: string;
  readonly createdAt: Date;
  readonly consentedAt?: Date | undefined;
  readonly isAdmin: boolean;
  readonly companyId?: string | undefined;
}) {
  return {
    id: driver.id,
    identifier: driver.identifier,
    createdAt: driver.createdAt,
    ...(driver.consentedAt === undefined ? {} : { consentedAt: driver.consentedAt }),
    isAdmin: driver.isAdmin,
    ...(driver.companyId === undefined ? {} : { companyId: driver.companyId }),
  };
}

function inviteCodeDto(invite: {
  readonly code: string;
  readonly redeemedBy: string | null;
  readonly redeemedAt: Date | null;
  readonly createdAt: Date;
}) {
  return {
    code: invite.code,
    redeemedBy: invite.redeemedBy,
    redeemedAt: invite.redeemedAt,
    createdAt: invite.createdAt,
  };
}

/**
 * `driverId` never comes from a body field a caller supplied — `request.driverId` is set by
 * `host/driver-auth.ts`'s hook, gated on the `/identity/devices/` prefix specifically (not all
 * of `/identity/`, which also serves the pre-token sign-in flow that can't require a token it
 * doesn't have yet). Duplicated from routing's/hazards'/feedback's own `requireDriverId` per
 * AGENTS.md rule 6, not shared.
 */
function requireDriverId(request: FastifyRequest, reply: FastifyReply): Id<'DriverId'> | undefined {
  if (request.driverId === undefined) {
    void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    return undefined;
  }
  return makeId<'DriverId'>(request.driverId);
}

/** `requireDriverId` first (401), then this (403) — the user-management screen's own gate. A
 *  non-admin never learns whether any other driver exists. */
async function requireAdmin(
  deps: IdentityRouteDeps,
  driverId: Id<'DriverId'>,
  reply: FastifyReply,
  requestId: string,
): Promise<boolean> {
  const caller = await deps.driverRepo.findById(driverId);
  if (!caller?.isAdmin) {
    void reply.status(403).send({ tag: 'Forbidden', requestId });
    return false;
  }
  return true;
}

/**
 * Internal endpoints (design doc §9) — core is not publicly exposed, so these are reachable only
 * by a trusted BFF, enforced at the host level (decision 11's `X-Internal-Key`, wired in
 * `host/internal-auth.ts`, M1.6). A driver-facing auth check on e.g. the revoke route is the
 * calling BFF's job, per "BFFs verify tokens" — `apps/driver-bff` does that before it ever
 * reaches here.
 */
export function registerIdentityRoutes(app: FastifyInstance, deps: IdentityRouteDeps): void {
  app.post('/identity/otp/request', async (request, reply) => {
    const parsed = requestOtpRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await requestOtp(deps.requestOtp, parsed.data);
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send({});
  });

  app.post('/identity/otp/verify', async (request, reply) => {
    const parsed = verifyOtpRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await verifyOtp(deps.verifyOtp, parsed.data);
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send({
      accessToken: result.value.accessToken,
      refreshToken: result.value.refreshToken,
      driver: driverDto(result.value.driver),
    });
  });

  app.post('/identity/token/refresh', async (request, reply) => {
    const parsed = refreshTokenRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await refreshToken(deps.refreshToken, parsed.data);
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(result.value);
  });

  app.post('/identity/sessions/:id/revoke', async (request, reply) => {
    const parsed = revokeSessionParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await revokeSession(deps.revokeSession, {
      sessionId: makeId<'SessionId'>(parsed.data.id),
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(204).send();
  });

  app.post('/identity/devices', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const parsed = registerDeviceRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await registerDevice(deps.registerDevice, {
      driverId,
      pushToken: parsed.data.pushToken,
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(201).send(result.value);
  });

  // M8, design doc §9: "privacy notice and consent screen at first launch." One tap, idempotent
  // (giveConsent itself doesn't error on a repeat call) — returns the updated Driver so the app
  // can stop showing the gate without a separate refetch.
  app.post('/identity/consent', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const result = await giveConsent(deps.giveConsent, { driverId });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(driverDto(result.value));
  });

  // M8, design doc §9: "a way for a tester to delete their account and data." 204 even on the
  // idempotent "already deleted" path — the caller asked for the account to be gone, and it is,
  // whether this call or an earlier one is what actually did it.
  app.delete('/identity/account', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;

    const result = await deleteAccount(deps.deleteAccount, { driverId });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(204).send();
  });

  // A BFF caches this and verifies tokens locally (decision 1) — core is the only thing that can
  // sign, everything else can only check a signature against this.
  app.get('/identity/.well-known/jwks.json', async (_request, reply) => {
    const jwk = await deps.tokenSigner.publicJwk();
    return reply.status(200).send({ keys: [jwk] });
  });

  // The user-management screen's own read (2026-09-27) — every driver, for an admin to assign a
  // company or a role to. Admin-gated; a non-admin gets 403, never a partial or filtered list.
  app.get('/identity/drivers', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;
    if (!(await requireAdmin(deps, driverId, reply, request.id))) return reply;

    const drivers = await listDrivers(deps.listDrivers);
    return reply.status(200).send({ drivers: drivers.map(driverDto) });
  });

  // The one sanctioned way to change `companyId`/`isAdmin` now (2026-09-27) — see
  // `application/update-driver.ts`'s own reasoning for why this replaces hand-editing the
  // database. Admin-gated; a non-admin never learns whether the target id exists.
  app.patch('/identity/drivers/:id', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;
    if (!(await requireAdmin(deps, driverId, reply, request.id))) return reply;

    const params = driverIdParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const body = updateDriverRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
    }
    const result = await updateDriver(deps.updateDriver, {
      id: makeId<'DriverId'>(params.data.id),
      ...(body.data.companyId === undefined
        ? {}
        : {
            companyId:
              body.data.companyId === null ? null : makeId<'CompanyId'>(body.data.companyId),
          }),
      ...(body.data.isAdmin === undefined ? {} : { isAdmin: body.data.isAdmin }),
    });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send(driverDto(result.value));
  });

  // The invite-codes admin screen's "Generate code" action (2026-09-27) — replaces the manual
  // `insert into identity.invite_codes` the README used to point at. Admin-gated, same shape as
  // every other admin-only route here.
  app.post('/identity/invite-codes', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;
    if (!(await requireAdmin(deps, driverId, reply, request.id))) return reply;

    const invite = await createInviteCode(deps.createInviteCode);
    return reply.status(201).send(inviteCodeDto(invite));
  });

  // The same screen's own list — every code, redeemed or not; the dashboard decides how to show
  // "active" vs "used".
  app.get('/identity/invite-codes', async (request, reply) => {
    const driverId = requireDriverId(request, reply);
    if (driverId === undefined) return reply;
    if (!(await requireAdmin(deps, driverId, reply, request.id))) return reply;

    const invites = await listInviteCodes(deps.listInviteCodes);
    return reply.status(200).send({ inviteCodes: invites.map(inviteCodeDto) });
  });
}
