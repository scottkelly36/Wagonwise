import { beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import {
  actorFor,
  PRIVILEGES,
  type FleetUser,
  type PlatformStaff,
} from '../domain/staff-account.js';
import { STAFF_CHALLENGE_MAX_ATTEMPTS } from '../domain/staff-challenge.js';
import { STAFF_INVITE_LIFETIME_MS } from '../domain/staff-invite.js';
import { STAFF_LOCKOUT_WINDOW_MS } from '../domain/staff-lockout.js';
import { STAFF_REFRESH_LIFETIME_MS } from '../domain/staff-session.js';
import { acceptStaffInvite } from './accept-staff-invite.js';
import { confirmStaffEnrolment } from './confirm-staff-enrolment.js';
import { createStaffInvite } from './create-staff-invite.js';
import { listStaffAudit } from './list-staff-audit.js';
import { listStaff, removeStaff, setStaffPrivileges } from './manage-staff.js';
import { normaliseRecoveryCode } from './recovery-code.js';
import { refreshStaffSession, signOutStaff } from './refresh-staff-session.js';
import type { StaffDeps } from './staff-deps.js';
import { staffSignIn, TIMING_DECOY_HASH } from './staff-sign-in.js';
import {
  FakePasswordHasher,
  FakeSecretBox,
  FakeStaffTokenIssuer,
  FakeTotp,
  RecordingCodeSender,
  SequentialRandomCodes,
} from './testing/fake-staff-crypto.js';
import {
  InMemoryStaffAccountRepository,
  InMemoryStaffChallengeRepository,
  InMemoryStaffInviteRepository,
  InMemoryStaffAuditLog,
  InMemoryStaffRecoveryCodeRepository,
  InMemoryStaffSessionRepository,
} from './testing/in-memory-staff-repositories.js';
import { verifyStaffSecondFactor } from './verify-staff-second-factor.js';

const acme = makeId<'CompanyId'>('company-acme');
const other = makeId<'CompanyId'>('company-other');
const PASSWORD = 'correct horse battery';

let deps: StaffDeps & {
  readonly clock: FakeClock;
  readonly codeSender: RecordingCodeSender;
  readonly totp: FakeTotp;
  readonly accounts: InMemoryStaffAccountRepository;
  readonly auditLog: InMemoryStaffAuditLog;
};
let admin: PlatformStaff;

beforeEach(async () => {
  deps = {
    accounts: new InMemoryStaffAccountRepository(),
    invites: new InMemoryStaffInviteRepository(),
    sessions: new InMemoryStaffSessionRepository(),
    challenges: new InMemoryStaffChallengeRepository(),
    recoveryCodes: new InMemoryStaffRecoveryCodeRepository(),
    auditLog: new InMemoryStaffAuditLog(),
    passwordHasher: new FakePasswordHasher(),
    secretBox: new FakeSecretBox(),
    totp: new FakeTotp(),
    codeSender: new RecordingCodeSender(),
    randomCodes: new SequentialRandomCodes(),
    tokenIssuer: new FakeStaffTokenIssuer(),
    clock: new FakeClock('2026-09-28T12:00:00.000Z'),
    ids: new SequentialIdGenerator(),
  };
  // The first WagonWise admin is bootstrapped outside these flows (P2-M1.12).
  admin = {
    kind: 'platform',
    id: makeId<'StaffId'>('admin'),
    email: 'support@wagon-wise.co.uk',
    name: 'Support',
    secondFactorMethod: 'totp',
    createdAt: deps.clock.now(),
  };
  await deps.accounts.create(admin, {
    staffId: admin.id,
    passwordHash: `hashed:${PASSWORD}`,
    secondFactor: { method: 'totp', secretCiphertext: 'sealed:ADMINSECRET' },
  });
});

/** Invite → accept → confirm, returning the new account and its sign-in result. */
async function onboard(
  input: { email: string; companyId?: typeof acme; privileges?: FleetUser['privileges'] },
  method: 'totp' | 'sms' | 'email' = 'totp',
) {
  const invited = await createStaffInvite(
    deps,
    actorFor(admin),
    input.companyId === undefined
      ? { kind: 'platform', email: input.email, name: 'New' }
      : {
          kind: 'fleet',
          email: input.email,
          name: 'New',
          companyId: input.companyId,
          privileges: input.privileges ?? [],
        },
  );
  if (!invited.ok) throw new Error(invited.error.tag);
  const accepted = await acceptStaffInvite(deps, {
    inviteToken: invited.value.token,
    password: PASSWORD,
    secondFactorMethod: method,
    phone: method === 'sms' ? '+447700900123' : undefined,
  });
  if (!accepted.ok) throw new Error(accepted.error.tag);
  const code =
    method === 'totp'
      ? deps.totp.currentCode
      : (deps.codeSender.lastCodeFor(method === 'sms' ? '+447700900123' : input.email) ?? '');
  const confirmed = await confirmStaffEnrolment(deps, {
    enrolmentId: accepted.value.enrolmentId,
    code,
  });
  if (!confirmed.ok) throw new Error(confirmed.error.tag);
  return confirmed.value;
}

describe('inviting', () => {
  it('lets a manager invite into their own company, and returns the link token once', async () => {
    const { staff: manager } = await onboard({
      email: 'boss@acme.example',
      companyId: acme,
      privileges: PRIVILEGES,
    });
    const result = await createStaffInvite(deps, actorFor(manager), {
      kind: 'fleet',
      email: 'dispatch@acme.example',
      name: 'Dispatcher',
      companyId: acme,
      privileges: ['dispatch'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.token).toMatch(/^invite-token-/);
    expect(result.value.invite.tokenHash).not.toBe(result.value.token);
    expect(result.value.invite.expiresAt.getTime() - deps.clock.now().getTime()).toBe(
      STAFF_INVITE_LIFETIME_MS,
    );
  });

  it('applies the permission rules', async () => {
    const { staff: viewer } = await onboard({
      email: 'viewer@acme.example',
      companyId: acme,
      privileges: ['view_reports'],
    });
    const forbidden = await createStaffInvite(deps, actorFor(viewer), {
      kind: 'fleet',
      email: 'x@acme.example',
      name: 'X',
      companyId: acme,
      privileges: [],
    });
    expect(forbidden).toEqual({ ok: false, error: { tag: 'Forbidden' } });

    const platform = await createStaffInvite(deps, actorFor(viewer), {
      kind: 'platform',
      email: 'x@wagon-wise.co.uk',
      name: 'X',
    });
    expect(platform).toEqual({ ok: false, error: { tag: 'Forbidden' } });
  });

  it("refuses an email that's already a live account", async () => {
    const result = await createStaffInvite(deps, actorFor(admin), {
      kind: 'platform',
      email: 'SUPPORT@wagon-wise.co.uk',
      name: 'Dup',
    });
    expect(result).toEqual({ ok: false, error: { tag: 'EmailAlreadyInUse' } });
  });
});

describe('joining from an invite', () => {
  async function invite() {
    const result = await createStaffInvite(deps, actorFor(admin), {
      kind: 'fleet',
      email: 'new@acme.example',
      name: 'New Starter',
      companyId: acme,
      privileges: ['dispatch', 'view_reports'],
    });
    if (!result.ok) throw new Error(result.error.tag);
    return result.value.token;
  }

  it('authenticator: returns a QR link and creates nothing until the first code works', async () => {
    const token = await invite();
    const accepted = await acceptStaffInvite(deps, {
      inviteToken: token,
      password: PASSWORD,
      secondFactorMethod: 'totp',
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.value.totpUri).toContain('otpauth://totp/');
    expect(await deps.accounts.findByEmail('new@acme.example')).toBeNull();

    const wrong = await confirmStaffEnrolment(deps, {
      enrolmentId: accepted.value.enrolmentId,
      code: '000000',
    });
    expect(wrong).toEqual({ ok: false, error: { tag: 'InvalidCode' } });
    expect(await deps.accounts.findByEmail('new@acme.example')).toBeNull();

    const confirmed = await confirmStaffEnrolment(deps, {
      enrolmentId: accepted.value.enrolmentId,
      code: deps.totp.currentCode,
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.value.staff).toMatchObject({
      kind: 'fleet',
      email: 'new@acme.example',
      companyId: acme,
      privileges: ['dispatch', 'view_reports'],
      secondFactorMethod: 'totp',
    });
    expect(confirmed.value.recoveryCodes).toHaveLength(10);
    expect(confirmed.value.accessToken).toContain(confirmed.value.staff.id);
    const credentials = await deps.accounts.findCredentials(confirmed.value.staff.id);
    expect(credentials?.secondFactor).toEqual({
      method: 'totp',
      secretCiphertext: 'sealed:FAKESECRET',
    });
    expect(credentials?.passwordHash).toBe(`hashed:${PASSWORD}`);
  });

  it('text message: sends the code to the phone given', async () => {
    const { staff } = await onboard({ email: 'sms@acme.example', companyId: acme }, 'sms');
    expect(deps.codeSender.sent.at(-1)?.destination).toBe('+447700900123');
    expect((await deps.accounts.findCredentials(staff.id))?.secondFactor).toEqual({
      method: 'sms',
      phone: '+447700900123',
    });
  });

  it('email: sends the code to the invited address', async () => {
    await onboard({ email: 'mail@acme.example', companyId: acme }, 'email');
    expect(deps.codeSender.sent.at(-1)?.destination).toBe('mail@acme.example');
  });

  it('an invite link works once', async () => {
    const token = await invite();
    const first = await acceptStaffInvite(deps, {
      inviteToken: token,
      password: PASSWORD,
      secondFactorMethod: 'totp',
    });
    if (!first.ok) throw new Error(first.error.tag);
    await confirmStaffEnrolment(deps, {
      enrolmentId: first.value.enrolmentId,
      code: deps.totp.currentCode,
    });
    const again = await acceptStaffInvite(deps, {
      inviteToken: token,
      password: PASSWORD,
      secondFactorMethod: 'totp',
    });
    expect(again).toEqual({ ok: false, error: { tag: 'InviteNotUsable' } });
  });

  it('refuses an unknown or expired invite link', async () => {
    expect(
      await acceptStaffInvite(deps, {
        inviteToken: 'nope',
        password: PASSWORD,
        secondFactorMethod: 'totp',
      }),
    ).toEqual({ ok: false, error: { tag: 'InviteNotUsable' } });

    const token = await invite();
    deps.clock.advance(STAFF_INVITE_LIFETIME_MS + 1);
    expect(
      await acceptStaffInvite(deps, {
        inviteToken: token,
        password: PASSWORD,
        secondFactorMethod: 'totp',
      }),
    ).toEqual({ ok: false, error: { tag: 'InviteNotUsable' } });
  });

  it('ends the enrolment after 5 wrong codes', async () => {
    const token = await invite();
    const accepted = await acceptStaffInvite(deps, {
      inviteToken: token,
      password: PASSWORD,
      secondFactorMethod: 'totp',
    });
    if (!accepted.ok) throw new Error(accepted.error.tag);
    for (let i = 0; i < STAFF_CHALLENGE_MAX_ATTEMPTS; i += 1) {
      await confirmStaffEnrolment(deps, {
        enrolmentId: accepted.value.enrolmentId,
        code: '000000',
      });
    }
    expect(
      await confirmStaffEnrolment(deps, {
        enrolmentId: accepted.value.enrolmentId,
        code: deps.totp.currentCode,
      }),
    ).toEqual({ ok: false, error: { tag: 'EnrolmentNotUsable' } });
  });

  it('reports a code that could not be sent', async () => {
    const token = await invite();
    deps.codeSender.fail = true;
    expect(
      await acceptStaffInvite(deps, {
        inviteToken: token,
        password: PASSWORD,
        secondFactorMethod: 'email',
      }),
    ).toEqual({ ok: false, error: { tag: 'CodeNotSent' } });
  });
});

describe('signing in', () => {
  it('needs the password and then the second factor', async () => {
    const challenge = await staffSignIn(deps, { email: admin.email, password: PASSWORD });
    expect(challenge.ok).toBe(true);
    if (!challenge.ok) return;
    expect(challenge.value.method).toBe('totp');

    const tokens = await verifyStaffSecondFactor(deps, {
      challengeId: challenge.value.challengeId,
      code: deps.totp.currentCode,
    });
    expect(tokens.ok).toBe(true);
    if (!tokens.ok) return;
    expect(tokens.value.staff.id).toBe(admin.id);
  });

  it('gives the same error for an unknown email and a wrong password', async () => {
    const unknown = await staffSignIn(deps, { email: 'nobody@example.com', password: PASSWORD });
    const wrong = await staffSignIn(deps, { email: admin.email, password: 'not it at all' });
    expect(unknown).toEqual({ ok: false, error: { tag: 'InvalidCredentials' } });
    expect(wrong).toEqual(unknown);
  });

  it('checks an unknown email against a well-formed decoy hash, so it costs a real hash', () => {
    const parts = TIMING_DECOY_HASH.split('$');
    expect(parts.slice(0, 4)).toEqual(['scrypt', '32768', '8', '1']);
    expect(Buffer.from(parts[4] ?? '', 'base64')).toHaveLength(16);
    expect(Buffer.from(parts[5] ?? '', 'base64')).toHaveLength(64);
  });

  it('texts a fresh code for SMS accounts', async () => {
    await onboard({ email: 'sms@acme.example', companyId: acme }, 'sms');
    const before = deps.codeSender.sent.length;
    const challenge = await staffSignIn(deps, { email: 'sms@acme.example', password: PASSWORD });
    if (!challenge.ok) throw new Error(challenge.error.tag);
    expect(deps.codeSender.sent).toHaveLength(before + 1);
    const code = deps.codeSender.lastCodeFor('+447700900123') ?? '';
    const tokens = await verifyStaffSecondFactor(deps, {
      challengeId: challenge.value.challengeId,
      code,
    });
    expect(tokens.ok).toBe(true);
  });

  it('accepts a recovery code once, however it is typed', async () => {
    const { recoveryCodes } = await onboard({ email: 'lost@acme.example', companyId: acme });
    const first = recoveryCodes[0] ?? '';
    const typed = first.toLowerCase().replace('-', ' ');

    const c1 = await staffSignIn(deps, { email: 'lost@acme.example', password: PASSWORD });
    if (!c1.ok) throw new Error(c1.error.tag);
    expect(
      (await verifyStaffSecondFactor(deps, { challengeId: c1.value.challengeId, code: typed })).ok,
    ).toBe(true);

    const c2 = await staffSignIn(deps, { email: 'lost@acme.example', password: PASSWORD });
    if (!c2.ok) throw new Error(c2.error.tag);
    expect(
      await verifyStaffSecondFactor(deps, { challengeId: c2.value.challengeId, code: first }),
    ).toEqual({ ok: false, error: { tag: 'InvalidCode' } });
  });

  it('ends the challenge after 5 wrong codes, and when it expires', async () => {
    const c1 = await staffSignIn(deps, { email: admin.email, password: PASSWORD });
    if (!c1.ok) throw new Error(c1.error.tag);
    for (let i = 0; i < STAFF_CHALLENGE_MAX_ATTEMPTS; i += 1) {
      await verifyStaffSecondFactor(deps, { challengeId: c1.value.challengeId, code: '000000' });
    }
    expect(
      await verifyStaffSecondFactor(deps, {
        challengeId: c1.value.challengeId,
        code: deps.totp.currentCode,
      }),
    ).toEqual({ ok: false, error: { tag: 'ChallengeNotUsable' } });

    const c2 = await staffSignIn(deps, { email: admin.email, password: PASSWORD });
    if (!c2.ok) throw new Error(c2.error.tag);
    deps.clock.advance(11 * 60 * 1000);
    expect(
      await verifyStaffSecondFactor(deps, {
        challengeId: c2.value.challengeId,
        code: deps.totp.currentCode,
      }),
    ).toEqual({ ok: false, error: { tag: 'ChallengeNotUsable' } });
  });

  it("can't reuse a challenge once it has signed someone in", async () => {
    const c = await staffSignIn(deps, { email: admin.email, password: PASSWORD });
    if (!c.ok) throw new Error(c.error.tag);
    await verifyStaffSecondFactor(deps, {
      challengeId: c.value.challengeId,
      code: deps.totp.currentCode,
    });
    expect(
      await verifyStaffSecondFactor(deps, {
        challengeId: c.value.challengeId,
        code: deps.totp.currentCode,
      }),
    ).toEqual({ ok: false, error: { tag: 'ChallengeNotUsable' } });
  });
});

describe('sessions', () => {
  async function signedIn() {
    const c = await staffSignIn(deps, { email: admin.email, password: PASSWORD });
    if (!c.ok) throw new Error(c.error.tag);
    const t = await verifyStaffSecondFactor(deps, {
      challengeId: c.value.challengeId,
      code: deps.totp.currentCode,
    });
    if (!t.ok) throw new Error(t.error.tag);
    return t.value;
  }

  it('rotates refresh tokens, and a replayed one revokes the session', async () => {
    const { refreshToken } = await signedIn();
    const next = await refreshStaffSession(deps, { refreshToken });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.value.refreshToken).not.toBe(refreshToken);

    expect(await refreshStaffSession(deps, { refreshToken })).toEqual({
      ok: false,
      error: { tag: 'StaffRefreshTokenReused' },
    });
    // The legitimate holder is signed out too: the session is gone.
    expect(await refreshStaffSession(deps, { refreshToken: next.value.refreshToken })).toEqual({
      ok: false,
      error: { tag: 'StaffSessionRevoked' },
    });
  });

  it('expires after 7 days without use', async () => {
    const { refreshToken } = await signedIn();
    deps.clock.advance(STAFF_REFRESH_LIFETIME_MS + 1);
    expect(await refreshStaffSession(deps, { refreshToken })).toEqual({
      ok: false,
      error: { tag: 'StaffSessionExpired' },
    });
  });

  it('signing out ends that session', async () => {
    const { refreshToken } = await signedIn();
    await signOutStaff(deps, { refreshToken });
    expect(await refreshStaffSession(deps, { refreshToken })).toEqual({
      ok: false,
      error: { tag: 'StaffSessionRevoked' },
    });
  });
});

describe('managing people', () => {
  it('lets a manager change a colleague, within the rules', async () => {
    const { staff: manager } = await onboard({
      email: 'boss@acme.example',
      companyId: acme,
      privileges: PRIVILEGES,
    });
    const { staff: viewer } = await onboard({
      email: 'viewer@acme.example',
      companyId: acme,
      privileges: ['view_reports'],
    });

    const updated = await setStaffPrivileges(deps, actorFor(manager), {
      staffId: viewer.id,
      privileges: ['view_reports', 'dispatch'],
    });
    expect(updated.ok).toBe(true);
    expect((await deps.accounts.findById(viewer.id)) as FleetUser).toMatchObject({
      privileges: ['view_reports', 'dispatch'],
    });

    expect(
      await setStaffPrivileges(deps, actorFor(manager), { staffId: manager.id, privileges: [] }),
    ).toEqual({ ok: false, error: { tag: 'LastManager' } });
  });

  it("removes someone and signs them out everywhere; they can't sign in again", async () => {
    const { staff: leaver, refreshToken } = await onboard({
      email: 'leaver@acme.example',
      companyId: acme,
    });
    expect((await removeStaff(deps, actorFor(admin), { staffId: leaver.id })).ok).toBe(true);
    expect(await refreshStaffSession(deps, { refreshToken })).toEqual({
      ok: false,
      error: { tag: 'StaffSessionRevoked' },
    });
    expect(await staffSignIn(deps, { email: 'leaver@acme.example', password: PASSWORD })).toEqual({
      ok: false,
      error: { tag: 'InvalidCredentials' },
    });
    expect(await removeStaff(deps, actorFor(admin), { staffId: leaver.id })).toEqual({
      ok: false,
      error: { tag: 'StaffNotFound' },
    });
  });

  it('lists a company for its managers, and everyone only for WagonWise admins', async () => {
    const { staff: manager } = await onboard({
      email: 'boss@acme.example',
      companyId: acme,
      privileges: ['manage_users'],
    });
    await onboard({ email: 'boss@other.example', companyId: other, privileges: ['manage_users'] });

    const own = await listStaff(deps, actorFor(manager), { companyId: acme });
    expect(own.ok && own.value.map((s) => s.email)).toEqual(['boss@acme.example']);
    expect(await listStaff(deps, actorFor(manager), { companyId: other })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await listStaff(deps, actorFor(manager), {})).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    const everyone = await listStaff(deps, actorFor(admin), {});
    expect(everyone.ok && everyone.value).toHaveLength(3);
  });
});

describe('normaliseRecoveryCode', () => {
  it('accepts any case, spaces or dashes; rejects anything else', () => {
    expect(normaliseRecoveryCode('abcde-fghjk')).toBe('ABCDE-FGHJK');
    expect(normaliseRecoveryCode(' ABCDE FGHJK ')).toBe('ABCDE-FGHJK');
    expect(normaliseRecoveryCode('ABCDEFGHJK')).toBe('ABCDE-FGHJK');
    expect(normaliseRecoveryCode('ABC')).toBeNull();
    expect(normaliseRecoveryCode('123456')).toBeNull();
  });
});

describe('audit log (P2-M1.11)', () => {
  const actions = () => deps.auditLog.entries.map((e) => e.action);

  it('records an invite and the join, filed under the company', async () => {
    const { staff } = await onboard({
      email: 'boss@acme.example',
      companyId: acme,
      privileges: ['dispatch'],
    });
    expect(actions()).toEqual(['invite_created', 'staff_joined']);
    const [invited, joined] = deps.auditLog.entries;
    expect(invited).toMatchObject({
      actorId: admin.id,
      companyId: acme,
      details: { email: 'boss@acme.example', kind: 'fleet', privileges: ['dispatch'] },
    });
    expect(joined).toMatchObject({
      actorId: staff.id,
      targetId: staff.id,
      companyId: acme,
      details: { method: 'totp', invitedBy: admin.id },
    });
    expect(joined?.at).toEqual(deps.clock.now());
  });

  it('records a wrong password, a wrong code, and the sign-in, saying which method passed', async () => {
    await onboard({ email: 'boss@acme.example', companyId: acme });
    deps.auditLog.entries.length = 0;

    await staffSignIn(deps, { email: 'boss@acme.example', password: 'wrong wrong wrong' });
    const challenge = await staffSignIn(deps, { email: 'boss@acme.example', password: PASSWORD });
    if (!challenge.ok) throw new Error(challenge.error.tag);
    await verifyStaffSecondFactor(deps, {
      challengeId: challenge.value.challengeId,
      code: '000000',
    });
    await verifyStaffSecondFactor(deps, {
      challengeId: challenge.value.challengeId,
      code: deps.totp.currentCode,
    });

    expect(actions()).toEqual(['sign_in_failed', 'second_factor_failed', 'signed_in']);
    expect(deps.auditLog.entries.every((e) => e.companyId === acme)).toBe(true);
    expect(deps.auditLog.entries[0]?.actorId).toBeUndefined(); // nobody was signed in yet
    expect(deps.auditLog.entries[2]?.details).toEqual({ method: 'totp' });
  });

  it('records a sign-in by recovery code as such', async () => {
    const { recoveryCodes } = await onboard({ email: 'boss@acme.example', companyId: acme });
    const challenge = await staffSignIn(deps, { email: 'boss@acme.example', password: PASSWORD });
    if (!challenge.ok) throw new Error(challenge.error.tag);
    await verifyStaffSecondFactor(deps, {
      challengeId: challenge.value.challengeId,
      code: recoveryCodes[0] ?? '',
    });
    expect(deps.auditLog.entries.at(-1)).toMatchObject({
      action: 'signed_in',
      details: { method: 'recovery_code' },
    });
  });

  it('does not record an unknown email: there is no account or company to file it under', async () => {
    await staffSignIn(deps, { email: 'nobody@example.com', password: PASSWORD });
    expect(actions()).toEqual([]);
  });

  it('records privilege changes with before and after, and removals, but not refused attempts', async () => {
    const { staff } = await onboard({
      email: 'boss@acme.example',
      companyId: acme,
      privileges: ['manage_users', 'view_reports'],
    });
    const { staff: worker } = await onboard({
      email: 'worker@acme.example',
      companyId: acme,
      privileges: ['view_reports'],
    });
    deps.auditLog.entries.length = 0;

    await setStaffPrivileges(deps, actorFor(staff), {
      staffId: worker.id,
      privileges: ['view_reports', 'manage_users'],
    });
    // Demote the worker again, then try to demote the last manager: refused, so no entry.
    await setStaffPrivileges(deps, actorFor(staff), { staffId: worker.id, privileges: [] });
    const refused = await setStaffPrivileges(deps, actorFor(staff), {
      staffId: staff.id,
      privileges: [],
    });
    expect(refused).toMatchObject({ ok: false, error: { tag: 'LastManager' } });
    await removeStaff(deps, actorFor(admin), { staffId: worker.id });

    expect(actions()).toEqual(['privileges_changed', 'privileges_changed', 'staff_removed']);
    expect(deps.auditLog.entries[0]).toMatchObject({
      actorId: staff.id,
      targetId: worker.id,
      companyId: acme,
      details: { before: ['view_reports'], after: ['view_reports', 'manage_users'] },
    });
    expect(deps.auditLog.entries[2]).toMatchObject({
      actorId: admin.id,
      targetId: worker.id,
      details: { email: 'worker@acme.example' },
    });
  });

  it('files WagonWise staff entries under no company', async () => {
    await onboard({ email: 'helper@wagon-wise.co.uk' });
    expect(deps.auditLog.entries.map((e) => e.companyId)).toEqual([undefined, undefined]);
  });

  describe('reading it', () => {
    beforeEach(async () => {
      await onboard({ email: 'boss@acme.example', companyId: acme, privileges: ['manage_users'] });
      await onboard({
        email: 'boss@other.example',
        companyId: other,
        privileges: ['manage_users'],
      });
      await onboard({ email: 'helper@wagon-wise.co.uk' });
    });

    it("gives a manager their own company's entries, newest first, and nobody else's", async () => {
      const manager = await deps.accounts.findByEmail('boss@acme.example');
      if (manager === null) throw new Error('missing');
      const own = await listStaffAudit(deps, actorFor(manager), { companyId: acme });
      expect(own.ok && own.value.map((e) => e.action)).toEqual(['staff_joined', 'invite_created']);
      expect(await listStaffAudit(deps, actorFor(manager), { companyId: other })).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
      expect(await listStaffAudit(deps, actorFor(manager), {})).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    });

    it('gives a WagonWise admin everything, WagonWise staff entries included', async () => {
      const all = await listStaffAudit(deps, actorFor(admin), {});
      expect(all.ok && all.value).toHaveLength(6);
    });
  });
});

describe('lockout (P2-M1.12)', () => {
  const email = 'boss@acme.example';

  async function wrongPassword(): Promise<void> {
    const result = await staffSignIn(deps, { email, password: 'wrong wrong wrong' });
    expect(result.ok).toBe(false);
  }

  it('locks sign-in after 5 wrong passwords in 15 minutes, even for the right password', async () => {
    await onboard({ email, companyId: acme });
    for (let i = 0; i < 4; i++) await wrongPassword();
    // Four wrong: still open.
    expect((await staffSignIn(deps, { email, password: PASSWORD })).ok).toBe(true);

    await wrongPassword();
    expect(await staffSignIn(deps, { email, password: PASSWORD })).toEqual({
      ok: false,
      error: { tag: 'TooManyAttempts' },
    });

    // Once the failures are 15 minutes old, the account opens again.
    deps.clock.advance(STAFF_LOCKOUT_WINDOW_MS + 1);
    expect((await staffSignIn(deps, { email, password: PASSWORD })).ok).toBe(true);
  });

  it('locks after 10 wrong codes, across sign-in attempts, refusing even the right code', async () => {
    await onboard({ email, companyId: acme });
    for (let attempt = 0; attempt < 2; attempt++) {
      const challenge = await staffSignIn(deps, { email, password: PASSWORD });
      if (!challenge.ok) throw new Error(challenge.error.tag);
      for (let i = 0; i < 5; i++) {
        await verifyStaffSecondFactor(deps, {
          challengeId: challenge.value.challengeId,
          code: '000000',
        });
      }
    }
    // A third sign-in is refused outright, before any code.
    expect(await staffSignIn(deps, { email, password: PASSWORD })).toEqual({
      ok: false,
      error: { tag: 'TooManyAttempts' },
    });
  });

  it('refuses the right code on a challenge opened just before the lockout', async () => {
    await onboard({ email, companyId: acme });
    const challenge = await staffSignIn(deps, { email, password: PASSWORD });
    if (!challenge.ok) throw new Error(challenge.error.tag);
    for (let i = 0; i < 5; i++) await wrongPassword();
    expect(
      await verifyStaffSecondFactor(deps, {
        challengeId: challenge.value.challengeId,
        code: deps.totp.currentCode,
      }),
    ).toEqual({ ok: false, error: { tag: 'TooManyAttempts' } });
  });

  it("never locks an unknown email (there's no account), and one account's failures don't lock another", async () => {
    await onboard({ email, companyId: acme });
    for (let i = 0; i < 6; i++) {
      expect(await staffSignIn(deps, { email: 'nobody@example.com', password: 'x' })).toEqual({
        ok: false,
        error: { tag: 'InvalidCredentials' },
      });
    }
    await onboard({ email: 'other@acme.example', companyId: acme });
    for (let i = 0; i < 5; i++) await wrongPassword();
    expect((await staffSignIn(deps, { email: 'other@acme.example', password: PASSWORD })).ok).toBe(
      true,
    );
  });
});
