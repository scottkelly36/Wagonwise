import {
  acceptStaffInviteRequestSchema,
  confirmStaffEnrolmentRequestSchema,
  createStaffInviteRequestSchema,
  listStaffQuerySchema,
  setStaffPrivilegesRequestSchema,
  staffIdParamsSchema,
  staffRefreshTokenRequestSchema,
  staffSignInRequestSchema,
  staffVerifySecondFactorRequestSchema,
} from '@wagonwise/contracts/staff';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { makeId } from '../../../shared/brand.js';
import { acceptStaffInvite } from '../application/accept-staff-invite.js';
import { confirmStaffEnrolment } from '../application/confirm-staff-enrolment.js';
import { createStaffInvite } from '../application/create-staff-invite.js';
import { listStaff, removeStaff, setStaffPrivileges } from '../application/manage-staff.js';
import { refreshStaffSession, signOutStaff } from '../application/refresh-staff-session.js';
import type { StaffDeps } from '../application/staff-deps.js';
import { staffSignIn } from '../application/staff-sign-in.js';
import { verifyStaffSecondFactor } from '../application/verify-staff-second-factor.js';
import { actorFor, type Actor, type StaffAccount } from '../domain/staff-account.js';
import type { StaffInvite } from '../domain/staff-invite.js';
import { staffStatusFor } from './staff-error-mapping.js';

export function staffDto(staff: StaffAccount) {
  return {
    id: staff.id,
    kind: staff.kind,
    email: staff.email,
    name: staff.name,
    ...(staff.kind === 'fleet' ? { companyId: staff.companyId } : {}),
    privileges: staff.kind === 'fleet' ? [...staff.privileges] : [],
    secondFactorMethod: staff.secondFactorMethod,
    createdAt: staff.createdAt.toISOString(),
  };
}

function inviteDto(invite: StaffInvite) {
  return {
    id: invite.id,
    kind: invite.kind,
    email: invite.email,
    name: invite.name,
    ...(invite.companyId === undefined ? {} : { companyId: invite.companyId }),
    privileges: [...invite.privileges],
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
  };
}

function badRequest(request: FastifyRequest, reply: FastifyReply) {
  return reply.status(400).send({ error: 'invalid_request', requestId: request.id });
}

function fail(request: FastifyRequest, reply: FastifyReply, error: { readonly tag: string }) {
  return reply.status(staffStatusFor(error)).send({ tag: error.tag, requestId: request.id });
}

/**
 * Staff (dashboard) routes, P2-M1.6. `host/staff-auth.ts` has already verified the staff token
 * for everything except the pre-sign-in routes. Each authenticated request loads the account
 * fresh to build its `Actor`, so a privilege change or removal takes effect on the very next
 * request, not when the 15-minute access token runs out.
 */
export function registerStaffRoutes(app: FastifyInstance, deps: StaffDeps): void {
  async function requireActor(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ actor: Actor; staff: StaffAccount } | undefined> {
    const staff =
      request.staffId === undefined
        ? null
        : await deps.accounts.findById(makeId<'StaffId'>(request.staffId));
    if (!staff) {
      await reply.status(401).send({ error: 'invalid_access_token', requestId: request.id });
      return undefined;
    }
    return { actor: actorFor(staff), staff };
  }

  // ---- Before there's a token -----------------------------------------------------------

  app.post('/staff/auth/sign-in', async (request, reply) => {
    const body = staffSignInRequestSchema.safeParse(request.body);
    if (!body.success) return badRequest(request, reply);
    const result = await staffSignIn(deps, body.data);
    if (!result.ok) return fail(request, reply, result.error);
    return reply.status(200).send({
      challengeId: result.value.challengeId,
      method: result.value.method,
      expiresAt: result.value.expiresAt.toISOString(),
    });
  });

  app.post('/staff/auth/second-factor', async (request, reply) => {
    const body = staffVerifySecondFactorRequestSchema.safeParse(request.body);
    if (!body.success) return badRequest(request, reply);
    const result = await verifyStaffSecondFactor(deps, {
      challengeId: makeId<'StaffChallengeId'>(body.data.challengeId),
      code: body.data.code,
    });
    if (!result.ok) return fail(request, reply, result.error);
    return reply.status(200).send({
      accessToken: result.value.accessToken,
      refreshToken: result.value.refreshToken,
      staff: staffDto(result.value.staff),
    });
  });

  app.post('/staff/auth/refresh', async (request, reply) => {
    const body = staffRefreshTokenRequestSchema.safeParse(request.body);
    if (!body.success) return badRequest(request, reply);
    const result = await refreshStaffSession(deps, body.data);
    if (!result.ok) return fail(request, reply, result.error);
    return reply.status(200).send(result.value);
  });

  app.post('/staff/auth/sign-out', async (request, reply) => {
    const body = staffRefreshTokenRequestSchema.safeParse(request.body);
    if (!body.success) return badRequest(request, reply);
    await signOutStaff(deps, body.data);
    return reply.status(204).send();
  });

  app.post('/staff/invites/accept', async (request, reply) => {
    const body = acceptStaffInviteRequestSchema.safeParse(request.body);
    if (!body.success) return badRequest(request, reply);
    const result = await acceptStaffInvite(deps, body.data);
    if (!result.ok) return fail(request, reply, result.error);
    return reply.status(200).send({
      enrolmentId: result.value.enrolmentId,
      secondFactorMethod: result.value.secondFactorMethod,
      ...(result.value.totpUri === undefined ? {} : { totpUri: result.value.totpUri }),
    });
  });

  app.post('/staff/invites/confirm', async (request, reply) => {
    const body = confirmStaffEnrolmentRequestSchema.safeParse(request.body);
    if (!body.success) return badRequest(request, reply);
    const result = await confirmStaffEnrolment(deps, {
      enrolmentId: makeId<'StaffChallengeId'>(body.data.enrolmentId),
      code: body.data.code,
    });
    if (!result.ok) return fail(request, reply, result.error);
    return reply.status(200).send({
      accessToken: result.value.accessToken,
      refreshToken: result.value.refreshToken,
      staff: staffDto(result.value.staff),
      recoveryCodes: result.value.recoveryCodes,
    });
  });

  // ---- Signed in ----------------------------------------------------------------------

  app.get('/staff/me', async (request, reply) => {
    const who = await requireActor(request, reply);
    if (!who) return reply;
    return reply.status(200).send(staffDto(who.staff));
  });

  app.post('/staff/invites', async (request, reply) => {
    const who = await requireActor(request, reply);
    if (!who) return reply;
    const body = createStaffInviteRequestSchema.safeParse(request.body);
    if (!body.success) return badRequest(request, reply);
    const input =
      body.data.kind === 'platform'
        ? { kind: 'platform' as const, email: body.data.email, name: body.data.name }
        : {
            kind: 'fleet' as const,
            email: body.data.email,
            name: body.data.name,
            companyId: makeId<'CompanyId'>(body.data.companyId ?? ''),
            privileges: body.data.privileges,
          };
    const result = await createStaffInvite(deps, who.actor, input);
    if (!result.ok) return fail(request, reply, result.error);
    return reply
      .status(201)
      .send({ invite: inviteDto(result.value.invite), inviteToken: result.value.token });
  });

  app.get('/staff/members', async (request, reply) => {
    const who = await requireActor(request, reply);
    if (!who) return reply;
    const query = listStaffQuerySchema.safeParse(request.query);
    if (!query.success) return badRequest(request, reply);
    const result = await listStaff(deps, who.actor, {
      companyId:
        query.data.companyId === undefined ? undefined : makeId<'CompanyId'>(query.data.companyId),
    });
    if (!result.ok) return fail(request, reply, result.error);
    return reply.status(200).send({ staff: result.value.map(staffDto) });
  });

  app.put('/staff/members/:id/privileges', async (request, reply) => {
    const who = await requireActor(request, reply);
    if (!who) return reply;
    const params = staffIdParamsSchema.safeParse(request.params);
    const body = setStaffPrivilegesRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) return badRequest(request, reply);
    const result = await setStaffPrivileges(deps, who.actor, {
      staffId: makeId<'StaffId'>(params.data.id),
      privileges: body.data.privileges,
    });
    if (!result.ok) return fail(request, reply, result.error);
    return reply.status(200).send(staffDto(result.value));
  });

  app.delete('/staff/members/:id', async (request, reply) => {
    const who = await requireActor(request, reply);
    if (!who) return reply;
    const params = staffIdParamsSchema.safeParse(request.params);
    if (!params.success) return badRequest(request, reply);
    const result = await removeStaff(deps, who.actor, {
      staffId: makeId<'StaffId'>(params.data.id),
    });
    if (!result.ok) return fail(request, reply, result.error);
    return reply.status(204).send();
  });
}
