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
import type { DataScope, DataScopes } from '../../../shared/ports/data-scope.js';
import { acceptStaffInvite } from '../application/accept-staff-invite.js';
import { confirmStaffEnrolment } from '../application/confirm-staff-enrolment.js';
import { createStaffInvite } from '../application/create-staff-invite.js';
import { listStaffAudit } from '../application/list-staff-audit.js';
import { listStaff, removeStaff, setStaffPrivileges } from '../application/manage-staff.js';
import { refreshStaffSession, signOutStaff } from '../application/refresh-staff-session.js';
import type { StaffDeps } from '../application/staff-deps.js';
import { staffSignIn } from '../application/staff-sign-in.js';
import { verifyStaffSecondFactor } from '../application/verify-staff-second-factor.js';
import { actorFor, type Actor, type StaffAccount } from '../domain/staff-account.js';
import type { StaffAuditEntry } from '../domain/staff-audit.js';
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

function auditDto(entry: StaffAuditEntry) {
  return {
    id: entry.id,
    at: entry.at.toISOString(),
    action: entry.action,
    ...(entry.actorId === undefined ? {} : { actorId: entry.actorId }),
    ...(entry.companyId === undefined ? {} : { companyId: entry.companyId }),
    ...(entry.targetId === undefined ? {} : { targetId: entry.targetId }),
    details: entry.details,
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

/** What a handler decided, sent only after its scope's transaction has committed: a response
 *  must never claim success for writes that then fail to commit. */
interface Outcome {
  readonly status: number;
  readonly body?: object;
}

const ok = (status: number, body?: object): Outcome => ({ status, ...(body ? { body } : {}) });
const badRequest = (): Outcome => ({ status: 400, body: { error: 'invalid_request' } });
const fail = (error: { readonly tag: string }): Outcome => ({
  status: staffStatusFor(error),
  body: { tag: error.tag },
});

function send(request: FastifyRequest, reply: FastifyReply, outcome: Outcome) {
  if (outcome.body === undefined) return reply.status(outcome.status).send();
  const body = outcome.status >= 400 ? { ...outcome.body, requestId: request.id } : outcome.body;
  return reply.status(outcome.status).send(body);
}

const STAFF_AUTH: DataScope = { kind: 'staff-auth' };

/** WagonWise admins see every company; a fleet user only their own (migration 0021). */
function scopeFor(staff: StaffAccount): DataScope {
  return staff.kind === 'platform'
    ? { kind: 'platform' }
    : { kind: 'company', companyId: staff.companyId };
}

/**
 * Staff (dashboard) routes, P2-M1.6. `host/staff-auth.ts` has already verified the staff token
 * for everything except the pre-sign-in routes. Each authenticated request loads the account
 * fresh to build its `Actor`, so a privilege change or removal takes effect on the very next
 * request, not when the 15-minute access token runs out.
 *
 * P2-M1.7: every handler runs inside a `DataScopes` transaction. The pre-sign-in routes, and
 * loading the signed-in account, use the `staff-auth` scope (an account has to be found before
 * its company is known); everything after that runs in the account's own scope, so the database
 * itself keeps a fleet user to their company's rows.
 */
export function registerStaffRoutes(
  app: FastifyInstance,
  deps: StaffDeps,
  scopes: DataScopes,
): void {
  /** Loads the signed-in account (401 if it's gone), then runs `work` in that account's scope. */
  async function asActor(
    request: FastifyRequest,
    work: (who: { actor: Actor; staff: StaffAccount }) => Promise<Outcome>,
  ): Promise<Outcome> {
    const staffId = request.staffId;
    const staff =
      staffId === undefined
        ? null
        : await scopes.run(STAFF_AUTH, () => deps.accounts.findById(makeId<'StaffId'>(staffId)));
    if (!staff) return { status: 401, body: { error: 'invalid_access_token' } };
    return scopes.run(scopeFor(staff), () => work({ actor: actorFor(staff), staff }));
  }

  // ---- Before there's a token -----------------------------------------------------------

  app.post('/staff/auth/sign-in', async (request, reply) => {
    const body = staffSignInRequestSchema.safeParse(request.body);
    if (!body.success) return send(request, reply, badRequest());
    const outcome = await scopes.run(STAFF_AUTH, async () => {
      const result = await staffSignIn(deps, body.data);
      if (!result.ok) return fail(result.error);
      return ok(200, {
        challengeId: result.value.challengeId,
        method: result.value.method,
        expiresAt: result.value.expiresAt.toISOString(),
      });
    });
    return send(request, reply, outcome);
  });

  app.post('/staff/auth/second-factor', async (request, reply) => {
    const body = staffVerifySecondFactorRequestSchema.safeParse(request.body);
    if (!body.success) return send(request, reply, badRequest());
    const outcome = await scopes.run(STAFF_AUTH, async () => {
      const result = await verifyStaffSecondFactor(deps, {
        challengeId: makeId<'StaffChallengeId'>(body.data.challengeId),
        code: body.data.code,
      });
      if (!result.ok) return fail(result.error);
      return ok(200, {
        accessToken: result.value.accessToken,
        refreshToken: result.value.refreshToken,
        staff: staffDto(result.value.staff),
      });
    });
    return send(request, reply, outcome);
  });

  app.post('/staff/auth/refresh', async (request, reply) => {
    const body = staffRefreshTokenRequestSchema.safeParse(request.body);
    if (!body.success) return send(request, reply, badRequest());
    const outcome = await scopes.run(STAFF_AUTH, async () => {
      const result = await refreshStaffSession(deps, body.data);
      if (!result.ok) return fail(result.error);
      return ok(200, result.value);
    });
    return send(request, reply, outcome);
  });

  app.post('/staff/auth/sign-out', async (request, reply) => {
    const body = staffRefreshTokenRequestSchema.safeParse(request.body);
    if (!body.success) return send(request, reply, badRequest());
    await scopes.run(STAFF_AUTH, () => signOutStaff(deps, body.data));
    return send(request, reply, ok(204));
  });

  app.post('/staff/invites/accept', async (request, reply) => {
    const body = acceptStaffInviteRequestSchema.safeParse(request.body);
    if (!body.success) return send(request, reply, badRequest());
    const outcome = await scopes.run(STAFF_AUTH, async () => {
      const result = await acceptStaffInvite(deps, body.data);
      if (!result.ok) return fail(result.error);
      return ok(200, {
        enrolmentId: result.value.enrolmentId,
        secondFactorMethod: result.value.secondFactorMethod,
        ...(result.value.totpUri === undefined ? {} : { totpUri: result.value.totpUri }),
      });
    });
    return send(request, reply, outcome);
  });

  app.post('/staff/invites/confirm', async (request, reply) => {
    const body = confirmStaffEnrolmentRequestSchema.safeParse(request.body);
    if (!body.success) return send(request, reply, badRequest());
    const outcome = await scopes.run(STAFF_AUTH, async () => {
      const result = await confirmStaffEnrolment(deps, {
        enrolmentId: makeId<'StaffChallengeId'>(body.data.enrolmentId),
        code: body.data.code,
      });
      if (!result.ok) return fail(result.error);
      return ok(200, {
        accessToken: result.value.accessToken,
        refreshToken: result.value.refreshToken,
        staff: staffDto(result.value.staff),
        recoveryCodes: result.value.recoveryCodes,
      });
    });
    return send(request, reply, outcome);
  });

  // ---- Signed in ----------------------------------------------------------------------

  app.get('/staff/me', async (request, reply) => {
    const outcome = await asActor(request, ({ staff }) =>
      Promise.resolve(ok(200, staffDto(staff))),
    );
    return send(request, reply, outcome);
  });

  app.post('/staff/invites', async (request, reply) => {
    const outcome = await asActor(request, async ({ actor }) => {
      const body = createStaffInviteRequestSchema.safeParse(request.body);
      if (!body.success) return badRequest();
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
      const result = await createStaffInvite(deps, actor, input);
      if (!result.ok) return fail(result.error);
      if (result.value.emailError !== undefined) {
        request.log.error({ err: result.value.emailError }, 'could not email staff invitation');
      }
      return ok(201, {
        invite: inviteDto(result.value.invite),
        inviteToken: result.value.token,
        emailed: result.value.emailed,
      });
    });
    return send(request, reply, outcome);
  });

  app.get('/staff/members', async (request, reply) => {
    const outcome = await asActor(request, async ({ actor }) => {
      const query = listStaffQuerySchema.safeParse(request.query);
      if (!query.success) return badRequest();
      const result = await listStaff(deps, actor, {
        companyId:
          query.data.companyId === undefined
            ? undefined
            : makeId<'CompanyId'>(query.data.companyId),
      });
      if (!result.ok) return fail(result.error);
      return ok(200, { staff: result.value.map(staffDto) });
    });
    return send(request, reply, outcome);
  });

  // The audit log (P2-M1.11): same query and visibility as the members list.
  app.get('/staff/audit', async (request, reply) => {
    const outcome = await asActor(request, async ({ actor }) => {
      const query = listStaffQuerySchema.safeParse(request.query);
      if (!query.success) return badRequest();
      const result = await listStaffAudit(deps, actor, {
        companyId:
          query.data.companyId === undefined
            ? undefined
            : makeId<'CompanyId'>(query.data.companyId),
      });
      if (!result.ok) return fail(result.error);
      return ok(200, { entries: result.value.map(auditDto) });
    });
    return send(request, reply, outcome);
  });

  app.put('/staff/members/:id/privileges', async (request, reply) => {
    const outcome = await asActor(request, async ({ actor }) => {
      const params = staffIdParamsSchema.safeParse(request.params);
      const body = setStaffPrivilegesRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) return badRequest();
      const result = await setStaffPrivileges(deps, actor, {
        staffId: makeId<'StaffId'>(params.data.id),
        privileges: body.data.privileges,
      });
      if (!result.ok) return fail(result.error);
      return ok(200, staffDto(result.value));
    });
    return send(request, reply, outcome);
  });

  app.delete('/staff/members/:id', async (request, reply) => {
    const outcome = await asActor(request, async ({ actor }) => {
      const params = staffIdParamsSchema.safeParse(request.params);
      if (!params.success) return badRequest();
      const result = await removeStaff(deps, actor, {
        staffId: makeId<'StaffId'>(params.data.id),
      });
      if (!result.ok) return fail(result.error);
      return ok(204);
    });
    return send(request, reply, outcome);
  });
}
