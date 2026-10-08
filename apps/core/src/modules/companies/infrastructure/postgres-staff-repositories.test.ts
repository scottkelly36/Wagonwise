import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'kysely';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { FleetUser, PlatformStaff } from '../domain/staff-account.js';
import type { EnrolmentChallenge, SignInChallenge } from '../domain/staff-challenge.js';
import type { StaffCredentials } from '../domain/staff-credentials.js';
import type { StaffInvite } from '../domain/staff-invite.js';
import type { StaffSession } from '../domain/staff-session.js';
import type { UntypedDb } from './db.js';
import { PostgresCompanyRepository } from './postgres-company-repository.js';
import { PostgresStaffAccountRepository } from './postgres-staff-account-repository.js';
import { PostgresStaffAuditLog } from './postgres-staff-audit-log.js';
import { PostgresStaffChallengeRepository } from './postgres-staff-challenge-repository.js';
import { PostgresStaffInviteRepository } from './postgres-staff-invite-repository.js';
import { PostgresStaffRecoveryCodeRepository } from './postgres-staff-recovery-code-repository.js';
import { PostgresStaffSessionRepository } from './postgres-staff-session-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';

const companyA = makeId<'CompanyId'>('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const companyB = makeId<'CompanyId'>('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
const t0 = new Date('2026-09-28T12:00:00.000Z');

const admin: PlatformStaff = {
  kind: 'platform',
  id: makeId<'StaffId'>('10000000-0000-4000-8000-000000000001'),
  email: 'support@wagon-wise.co.uk',
  name: 'Support',
  secondFactorMethod: 'sms',
  createdAt: t0,
};
const adminCredentials: StaffCredentials = {
  staffId: admin.id,
  passwordHash: 'scrypt$admin',
  secondFactor: { method: 'sms', phone: '+447700900123' },
};

const owner: FleetUser = {
  kind: 'fleet',
  id: makeId<'StaffId'>('20000000-0000-4000-8000-000000000002'),
  email: 'Owner@Acme.example',
  name: 'Owner',
  secondFactorMethod: 'totp',
  createdAt: t0,
  companyId: companyA,
  privileges: ['manage_users', 'dispatch'],
};
const ownerCredentials: StaffCredentials = {
  staffId: owner.id,
  passwordHash: 'scrypt$owner',
  secondFactor: { method: 'totp', secretCiphertext: 'ciphertext' },
};

const viewer: FleetUser = {
  ...owner,
  id: makeId<'StaffId'>('30000000-0000-4000-8000-000000000003'),
  email: 'viewer@acme.example',
  name: 'Viewer',
  secondFactorMethod: 'email',
  privileges: ['view_reports'],
};
const viewerCredentials: StaffCredentials = {
  staffId: viewer.id,
  passwordHash: 'scrypt$viewer',
  secondFactor: { method: 'email' },
};

describe('Postgres staff repositories', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: UntypedDb;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    db = createDb(pool);
    await applySchema(pool);
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await sql`truncate companies.staff_audit, companies.staff_recovery_codes, companies.staff_challenges,
      companies.staff_sessions, companies.staff_invites, companies.staff_accounts,
      companies.companies cascade`.execute(db);
    const companies = new PostgresCompanyRepository(db);
    await companies.save({ id: companyA, name: 'Acme', createdAt: t0, photoRetentionMonths: 12 });
    await companies.save({ id: companyB, name: 'Other', createdAt: t0, photoRetentionMonths: 12 });
  });

  describe('PostgresStaffAccountRepository', () => {
    const repo = () => new PostgresStaffAccountRepository(db);

    it('round-trips platform staff and fleet users with their credentials', async () => {
      await repo().create(admin, adminCredentials);
      await repo().create(owner, ownerCredentials);
      await repo().create(viewer, viewerCredentials);

      expect(await repo().findById(admin.id)).toEqual(admin);
      expect(await repo().findById(owner.id)).toEqual(owner);
      expect(await repo().findCredentials(admin.id)).toEqual(adminCredentials);
      expect(await repo().findCredentials(owner.id)).toEqual(ownerCredentials);
      expect(await repo().findCredentials(viewer.id)).toEqual(viewerCredentials);
    });

    it('finds by email case-insensitively', async () => {
      await repo().create(owner, ownerCredentials);
      expect(await repo().findByEmail('owner@acme.EXAMPLE')).toEqual(owner);
      expect(await repo().findByEmail('nobody@acme.example')).toBeNull();
    });

    it('refuses a second live account with the same email', async () => {
      await repo().create(owner, ownerCredentials);
      const clash = { ...viewer, email: 'OWNER@acme.example' };
      await expect(
        repo().create(clash, { ...viewerCredentials, staffId: clash.id }),
      ).rejects.toThrow();
    });

    it('hides removed accounts, and frees their email for a new one', async () => {
      await repo().create(owner, ownerCredentials);
      await repo().remove(owner.id, t0);
      expect(await repo().findById(owner.id)).toBeNull();
      expect(await repo().findCredentials(owner.id)).toBeNull();
      expect(await repo().findByEmail(owner.email)).toBeNull();

      const replacement = { ...viewer, email: owner.email };
      await repo().create(replacement, { ...viewerCredentials, staffId: replacement.id });
      expect(await repo().findByEmail(owner.email)).toEqual(replacement);
    });

    it('saves privilege and name changes, and credential changes separately', async () => {
      await repo().create(owner, ownerCredentials);
      const renamed: FleetUser = { ...owner, name: 'Boss', privileges: ['view_reports'] };
      await repo().save(renamed);
      expect(await repo().findById(owner.id)).toEqual(renamed);

      const switched: StaffCredentials = {
        staffId: owner.id,
        passwordHash: 'scrypt$new',
        secondFactor: { method: 'sms', phone: '+447700900999' },
      };
      await repo().saveCredentials(switched);
      expect(await repo().findCredentials(owner.id)).toEqual(switched);
    });

    it('lists by company, lists everyone platform-first, and counts managers', async () => {
      await repo().create(viewer, viewerCredentials);
      await repo().create(owner, ownerCredentials);
      await repo().create(admin, adminCredentials);
      const otherManager: FleetUser = {
        ...owner,
        id: makeId<'StaffId'>('40000000-0000-4000-8000-000000000004'),
        email: 'boss@other.example',
        companyId: companyB,
      };
      await repo().create(otherManager, { ...ownerCredentials, staffId: otherManager.id });

      expect((await repo().listByCompany(companyA)).map((a) => a.id)).toEqual([
        owner.id,
        viewer.id,
      ]);
      expect((await repo().listAll())[0]?.id).toBe(admin.id);
      expect(await repo().listAll()).toHaveLength(4);
      expect(await repo().countManagers(companyA)).toBe(1);
      expect(await repo().countManagers(companyB)).toBe(1);

      await repo().remove(owner.id, t0);
      expect(await repo().countManagers(companyA)).toBe(0);
    });

    it('rejects a fleet user without a company at the database level', async () => {
      await expect(
        sql`insert into companies.staff_accounts
              (id, kind, email, name, created_at, password_hash, second_factor_method)
            values ('50000000-0000-4000-8000-000000000005', 'fleet', 'x@y.z', 'X', now(),
                    'h', 'email')`.execute(db),
      ).rejects.toThrow(/fleet_users_have_a_company/);
    });
  });

  describe('PostgresStaffInviteRepository', () => {
    const repo = () => new PostgresStaffInviteRepository(db);
    const invite = (): StaffInvite => ({
      id: makeId<'StaffInviteId'>('60000000-0000-4000-8000-000000000006'),
      kind: 'fleet',
      companyId: companyA,
      email: 'new@acme.example',
      name: 'New',
      privileges: ['dispatch'],
      tokenHash: 'sha256-token',
      invitedBy: owner.id,
      createdAt: t0,
      expiresAt: new Date('2026-10-05T12:00:00.000Z'),
      acceptedAt: null,
    });

    beforeEach(async () => {
      await new PostgresStaffAccountRepository(db).create(owner, ownerCredentials);
    });

    it('round-trips and finds by token hash', async () => {
      await repo().save(invite());
      expect(await repo().findById(invite().id)).toEqual(invite());
      expect(await repo().findByTokenHash('sha256-token')).toEqual(invite());
      expect(await repo().findByTokenHash('nope')).toBeNull();
      expect(await repo().listByCompany(companyA)).toEqual([invite()]);
      expect(await repo().listByCompany(companyB)).toEqual([]);
    });

    it('records acceptance on a second save', async () => {
      await repo().save(invite());
      const accepted = { ...invite(), acceptedAt: new Date('2026-09-29T09:00:00.000Z') };
      await repo().save(accepted);
      expect(await repo().findById(invite().id)).toEqual(accepted);
    });

    it('round-trips a platform invite with no company', async () => {
      const platform: StaffInvite = {
        ...invite(),
        kind: 'platform',
        companyId: undefined,
        privileges: [],
      };
      await repo().save(platform);
      expect(await repo().findById(platform.id)).toEqual(platform);
    });

    it('round-trips the bootstrap invite, which has no inviter (0024)', async () => {
      const bootstrap: StaffInvite = {
        ...invite(),
        kind: 'platform',
        companyId: undefined,
        privileges: [],
        invitedBy: null,
      };
      await repo().save(bootstrap);
      expect(await repo().findById(bootstrap.id)).toEqual(bootstrap);
    });
  });

  describe('PostgresStaffSessionRepository', () => {
    const repo = () => new PostgresStaffSessionRepository(db);
    const session = (): StaffSession => ({
      id: makeId<'StaffSessionId'>('70000000-0000-4000-8000-000000000007'),
      staffId: owner.id,
      refreshTokenHash: 'current',
      previousRefreshTokenHash: 'previous',
      issuedAt: t0,
      lastUsedAt: t0,
      refreshExpiresAt: new Date('2026-11-27T12:00:00.000Z'),
      revokedAt: null,
    });

    beforeEach(async () => {
      await new PostgresStaffAccountRepository(db).create(owner, ownerCredentials);
    });

    it('finds by the current or the previous refresh-token hash', async () => {
      await repo().save(session());
      expect(await repo().findByRefreshTokenHash('current')).toEqual(session());
      expect(await repo().findByRefreshTokenHash('previous')).toEqual(session());
      expect(await repo().findByRefreshTokenHash('other')).toBeNull();
    });

    it('revokes every live session for a staff member', async () => {
      await repo().save(session());
      const at = new Date('2026-09-29T00:00:00.000Z');
      await repo().revokeAllForStaff(owner.id, at);
      expect((await repo().findById(session().id))?.revokedAt).toEqual(at);
    });
  });

  describe('PostgresStaffChallengeRepository', () => {
    const repo = () => new PostgresStaffChallengeRepository(db);

    it('round-trips a sign-in challenge and records attempts and use', async () => {
      await new PostgresStaffAccountRepository(db).create(owner, ownerCredentials);
      const challenge: SignInChallenge = {
        id: makeId<'StaffChallengeId'>('80000000-0000-4000-8000-000000000008'),
        purpose: 'sign-in',
        staffId: owner.id,
        method: 'totp',
        codeHash: null,
        attempts: 0,
        createdAt: t0,
        expiresAt: new Date('2026-09-28T12:10:00.000Z'),
        consumedAt: null,
      };
      await repo().save(challenge);
      expect(await repo().findById(challenge.id)).toEqual(challenge);

      const used = { ...challenge, attempts: 2, consumedAt: new Date('2026-09-28T12:01:00Z') };
      await repo().save(used);
      expect(await repo().findById(challenge.id)).toEqual(used);
    });

    it('round-trips an enrolment challenge with its pending credentials', async () => {
      await new PostgresStaffAccountRepository(db).create(owner, ownerCredentials);
      const invite: StaffInvite = {
        id: makeId<'StaffInviteId'>('60000000-0000-4000-8000-000000000006'),
        kind: 'fleet',
        companyId: companyA,
        email: 'new@acme.example',
        name: 'New',
        privileges: [],
        tokenHash: 't',
        invitedBy: owner.id,
        createdAt: t0,
        expiresAt: new Date('2026-10-05T12:00:00.000Z'),
        acceptedAt: null,
      };
      await new PostgresStaffInviteRepository(db).save(invite);
      const challenge: EnrolmentChallenge = {
        id: makeId<'StaffChallengeId'>('90000000-0000-4000-8000-000000000009'),
        purpose: 'enrolment',
        inviteId: invite.id,
        method: 'sms',
        codeHash: 'sha256-code',
        pendingPasswordHash: 'scrypt$pending',
        pendingTotpSecretCiphertext: null,
        pendingPhone: '+447700900123',
        attempts: 0,
        createdAt: t0,
        expiresAt: new Date('2026-09-28T12:10:00.000Z'),
        consumedAt: null,
      };
      await repo().save(challenge);
      expect(await repo().findById(challenge.id)).toEqual(challenge);
    });
  });

  describe('PostgresStaffRecoveryCodeRepository', () => {
    const repo = () => new PostgresStaffRecoveryCodeRepository(db);

    beforeEach(async () => {
      await new PostgresStaffAccountRepository(db).create(owner, ownerCredentials);
    });

    it('uses each code once and replaces the whole set', async () => {
      await repo().replaceAll(owner.id, ['a', 'b', 'c']);
      expect(await repo().countUnused(owner.id)).toBe(3);

      expect(await repo().use(owner.id, 'b', t0)).toBe(true);
      expect(await repo().use(owner.id, 'b', t0)).toBe(false);
      expect(await repo().use(owner.id, 'zzz', t0)).toBe(false);
      expect(await repo().countUnused(owner.id)).toBe(2);

      await repo().replaceAll(owner.id, ['x', 'y']);
      expect(await repo().countUnused(owner.id)).toBe(2);
      expect(await repo().use(owner.id, 'a', t0)).toBe(false);
      expect(await repo().use(owner.id, 'x', t0)).toBe(true);
    });
  });

  describe('PostgresStaffAuditLog', () => {
    const log = () => new PostgresStaffAuditLog(db);
    const entry = (n: number, companyId: typeof companyA | undefined) => ({
      id: makeId<'StaffAuditEntryId'>(`4000000${n}-0000-4000-8000-00000000000${n}`),
      at: new Date(t0.getTime() + n * 1000),
      action: 'privileges_changed' as const,
      actorId: owner.id,
      companyId,
      targetId: viewer.id,
      details: { before: ['view_reports'], after: ['view_reports', 'dispatch'] },
    });

    it('round-trips entries, newest first, filtered by company, with nothing absent made up', async () => {
      await log().record(entry(1, companyA));
      await log().record(entry(2, companyB));
      await log().record(entry(3, undefined));
      await log().record({
        id: makeId<'StaffAuditEntryId'>('40000004-0000-4000-8000-000000000004'),
        at: new Date(t0.getTime() + 4000),
        action: 'sign_in_failed',
        actorId: undefined,
        companyId: companyA,
        targetId: owner.id,
        details: {},
      });

      const acme = await log().recent({ companyId: companyA, limit: 10 });
      expect(acme.map((e) => e.action)).toEqual(['sign_in_failed', 'privileges_changed']);
      expect(acme[1]).toEqual(entry(1, companyA));
      expect(acme[0]?.actorId).toBeUndefined();

      const everyone = await log().recent({ limit: 10 });
      expect(everyone.map((e) => e.at.getTime() - t0.getTime())).toEqual([4000, 3000, 2000, 1000]);
      expect(everyone[1]?.companyId).toBeUndefined();
      expect(await log().recent({ limit: 2 })).toHaveLength(2);
    });

    it("counts one account's entries of one action since a time (the lockout count)", async () => {
      const failed = (
        n: number,
        targetId: typeof owner.id,
        action: 'sign_in_failed' | 'signed_in',
      ) => ({
        id: makeId<'StaffAuditEntryId'>(`5000000${n}-0000-4000-8000-00000000000${n}`),
        at: new Date(t0.getTime() + n * 60_000),
        action,
        actorId: undefined,
        companyId: companyA,
        targetId,
        details: {},
      });
      await log().record(failed(1, owner.id, 'sign_in_failed'));
      await log().record(failed(2, owner.id, 'sign_in_failed'));
      await log().record(failed(3, owner.id, 'signed_in'));
      await log().record(failed(4, viewer.id, 'sign_in_failed'));

      const count = (since: Date) =>
        log().countSince({ targetId: owner.id, action: 'sign_in_failed', since });
      expect(await count(t0)).toBe(2);
      expect(await count(new Date(t0.getTime() + 2 * 60_000))).toBe(1);
      expect(await count(new Date(t0.getTime() + 10 * 60_000))).toBe(0);
    });

    it('rejects an action the log does not know, at the database level', async () => {
      await expect(
        sql`insert into companies.staff_audit (id, at, action)
            values (gen_random_uuid(), now(), 'deleted_everything')`.execute(db),
      ).rejects.toThrow(/check constraint/);
    });
  });
});
