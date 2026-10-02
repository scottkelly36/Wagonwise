import {
  refreshTokenRequestSchema,
  registerDeviceRequestSchema,
  requestOtpRequestSchema,
  revokeSessionParamsSchema,
  verifyOtpRequestSchema,
} from '@wagonwise/contracts/identity';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId, type Id } from '../../../shared/brand.js';
import { createInviteCode, type CreateInviteCodeDeps } from '../application/create-invite-code.js';
import { deleteAccount, type DeleteAccountDeps } from '../application/delete-account.js';
import { giveConsent, type GiveConsentDeps } from '../application/give-consent.js';
import { listInviteCodes, type ListInviteCodesDeps } from '../application/list-invite-codes.js';
import { refreshToken, type RefreshTokenDeps } from '../application/refresh-token.js';
import { registerDevice, type RegisterDeviceDeps } from '../application/register-device.js';
import { requestOtp, type RequestOtpDeps } from '../application/request-otp.js';
import { revokeSession, type RevokeSessionDeps } from '../application/revoke-session.js';
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
  readonly createInviteCode: CreateInviteCodeDeps;
  readonly listInviteCodes: ListInviteCodesDeps;
  readonly tokenSigner: TokenSigner;
}

function driverDto(driver: {
  readonly id: string;
  readonly identifier: string;
  readonly createdAt: Date;
  readonly consentedAt?: Date | undefined;
}) {
  return {
    id: driver.id,
    identifier: driver.identifier,
    createdAt: driver.createdAt,
    ...(driver.consentedAt === undefined ? {} : { consentedAt: driver.consentedAt }),
    // Drivers have had no admin flag or privileges since P2-M1.12c, and no single `companyId`
    // since P2-M2.8 (replaced by fleet.driver_links). Still sent, always false/empty, so
    // driver-app builds already installed keep parsing the sign-in response.
    isAdmin: false,
    scopes: [],
  };
}

/** The signed-in staff member, from `host/staff-auth.ts`, for the WagonWise admin screens below.
 *  401 if there isn't one. */
function requireStaffId(request: FastifyRequest, reply: FastifyReply): Id<'StaffId'> | undefined {
  if (request.staffId === undefined) {
    void reply.status(401).send({ error: 'unauthenticated', requestId: request.id });
    return undefined;
  }
  return makeId<'StaffId'>(request.staffId);
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

  // ---- WagonWise admin screens (staff tokens, P2-M1.12c) --------------------------------
  // The driver-accounts screen (every driver, assign a company) was here until P2-M2.8, when
  // fleet.driver_links replaced the single `drivers.company_id` it edited.

  // The invite-codes screen's "Generate code" action.
  app.post('/staff/invite-codes', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const result = await createInviteCode(deps.createInviteCode, { callerId: staffId });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(201).send(inviteCodeDto(result.value));
  });

  // Every code, redeemed or not; the dashboard decides how to show "active" vs "used".
  app.get('/staff/invite-codes', async (request, reply) => {
    const staffId = requireStaffId(request, reply);
    if (staffId === undefined) return reply;

    const result = await listInviteCodes(deps.listInviteCodes, { callerId: staffId });
    if (!result.ok) {
      return reply.status(statusFor(result.error)).send({ ...result.error, requestId: request.id });
    }
    return reply.status(200).send({ inviteCodes: result.value.map(inviteCodeDto) });
  });
}
