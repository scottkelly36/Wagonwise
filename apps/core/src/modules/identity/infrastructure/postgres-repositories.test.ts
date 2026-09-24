import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { Device } from '../domain/device.js';
import type { Driver } from '../domain/driver.js';
import type { InviteCode } from '../domain/invite-code.js';
import type { Otp } from '../domain/otp.js';
import type { Session } from '../domain/session.js';
import { PostgresDeviceRepository } from './postgres-device-repository.js';
import { PostgresDriverRepository } from './postgres-driver-repository.js';
import { PostgresInviteCodeRepository } from './postgres-invite-code-repository.js';
import { PostgresOtpRepository } from './postgres-otp-repository.js';
import { PostgresSessionRepository } from './postgres-session-repository.js';
import { applySchema } from './testing/apply-schema.js';
import { createDb, createPool } from './testing/db-for-tests.js';
import type { UntypedDb } from './db.js';
import type { Pool } from 'pg';

/**
 * One real PostGIS container (via Testcontainers) shared across all four repositories, with the
 * real migrations applied — this is what actually proves the SQL and the row<->domain mapping
 * are correct, which unit tests against fakes cannot.
 */
describe('identity Postgres repositories', () => {
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

  describe('PostgresDriverRepository', () => {
    const repo = () => new PostgresDriverRepository(db);

    it('round-trips a driver through save/findById/findByIdentifier', async () => {
      const driver: Driver = {
        id: makeId<'DriverId'>('11111111-1111-4111-8111-111111111111'),
        identifier: 'driver-a@example.com',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      await repo().save(driver);

      expect(await repo().findById(driver.id)).toEqual(driver);
      expect(await repo().findByIdentifier('driver-a@example.com')).toEqual(driver);
    });

    it('returns null for an unknown driver', async () => {
      expect(
        await repo().findById(makeId<'DriverId'>('00000000-0000-4000-8000-000000000000')),
      ).toBeNull();
      expect(await repo().findByIdentifier('nobody@example.com')).toBeNull();
    });

    it('rejects a duplicate identifier (unique constraint)', async () => {
      const driver: Driver = {
        id: makeId<'DriverId'>('22222222-2222-4222-8222-222222222222'),
        identifier: 'dup@example.com',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      await repo().save(driver);
      const dupe: Driver = {
        ...driver,
        id: makeId<'DriverId'>('33333333-3333-4333-8333-333333333333'),
      };
      await expect(repo().save(dupe)).rejects.toThrow();
    });
  });

  describe('PostgresInviteCodeRepository', () => {
    const repo = () => new PostgresInviteCodeRepository(db);

    it('round-trips an unredeemed invite code', async () => {
      const invite: InviteCode = {
        code: 'HEXHAM-A',
        redeemedBy: null,
        redeemedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      await repo().save(invite);
      expect(await repo().findByCode('HEXHAM-A')).toEqual(invite);
    });

    it('persists redemption as an update to the same row', async () => {
      const invite: InviteCode = {
        code: 'HEXHAM-B',
        redeemedBy: null,
        redeemedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      await repo().save(invite);

      const driverId = makeId<'DriverId'>('44444444-4444-4444-8444-444444444444');
      await new PostgresDriverRepository(db).save({
        id: driverId,
        identifier: 'redeemer@example.com',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
      });
      const redeemedAt = new Date('2026-02-01T00:00:00.000Z');
      await repo().save({ ...invite, redeemedBy: driverId, redeemedAt });

      const stored = await repo().findByCode('HEXHAM-B');
      expect(stored?.redeemedBy).toBe(driverId);
      expect(stored?.redeemedAt).toEqual(redeemedAt);
      expect(stored?.createdAt).toEqual(invite.createdAt); // untouched by the update
    });

    it('returns null for an unknown code', async () => {
      expect(await repo().findByCode('NOPE')).toBeNull();
    });
  });

  describe('PostgresSessionRepository', () => {
    const repo = () => new PostgresSessionRepository(db);

    function session(overrides: Partial<Session> = {}): Session {
      return {
        id: makeId<'SessionId'>('55555555-5555-4555-8555-555555555555'),
        driverId: makeId<'DriverId'>('66666666-6666-4666-8666-666666666666'),
        refreshTokenHash: 'hash-current',
        previousRefreshTokenHash: null,
        issuedAt: new Date('2026-01-01T00:00:00.000Z'),
        lastUsedAt: new Date('2026-01-01T00:00:00.000Z'),
        refreshExpiresAt: new Date('2026-03-01T00:00:00.000Z'),
        revokedAt: null,
        ...overrides,
      };
    }

    it('round-trips a session and finds it by its current hash', async () => {
      const driverId = makeId<'DriverId'>('66666666-6666-4666-8666-666666666666');
      await new PostgresDriverRepository(db).save({
        id: driverId,
        identifier: 'session-driver@example.com',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const s = session({ refreshTokenHash: 'hash-round-trip' });
      await repo().save(s);

      expect(await repo().findById(s.id)).toEqual(s);
      expect(await repo().findByRefreshTokenHash('hash-round-trip')).toEqual(s);
    });

    it('finds a session by its previous hash too', async () => {
      const s = session({
        id: makeId<'SessionId'>('77777777-7777-4777-8777-777777777777'),
        refreshTokenHash: 'hash-find-by-previous-current',
        previousRefreshTokenHash: 'hash-find-by-previous-previous',
      });
      await repo().save(s);
      expect(await repo().findByRefreshTokenHash('hash-find-by-previous-previous')).toEqual(s);
    });

    it('an update (rotate) overwrites the row rather than inserting a new one', async () => {
      const s = session({
        id: makeId<'SessionId'>('88888888-8888-4888-8888-888888888888'),
        refreshTokenHash: 'hash-rotate-before',
      });
      await repo().save(s);
      const rotated: Session = {
        ...s,
        refreshTokenHash: 'hash-rotate-after',
        previousRefreshTokenHash: 'hash-rotate-before',
        lastUsedAt: new Date('2026-01-02T00:00:00.000Z'),
      };
      await repo().save(rotated);

      expect(await repo().findById(s.id)).toEqual(rotated);
      // "before" is now the previous hash, and finds the same (rotated) row.
      expect(await repo().findByRefreshTokenHash('hash-rotate-before')).toEqual(rotated);
    });

    it('returns null for an unknown hash or id', async () => {
      expect(await repo().findByRefreshTokenHash('never-issued')).toBeNull();
      expect(
        await repo().findById(makeId<'SessionId'>('00000000-0000-4000-8000-000000000001')),
      ).toBeNull();
    });
  });

  describe('PostgresOtpRepository', () => {
    const repo = () => new PostgresOtpRepository(db);

    it('round-trips an OTP and finds it as the latest for its identifier', async () => {
      const otp: Otp = {
        id: '99999999-9999-4999-8999-999999999999',
        codeHash: 'code-hash-1',
        expiresAt: new Date('2026-01-01T00:10:00.000Z'),
        consumedAt: null,
        attempts: 0,
      };
      await repo().save('otp-driver@example.com', otp);
      expect(await repo().findLatestFor('otp-driver@example.com')).toEqual(otp);
    });

    it('a later request for the same identifier becomes the latest', async () => {
      const identifier = 'otp-driver-2@example.com';
      const first: Otp = {
        id: '10101010-1010-4101-8101-101010101010',
        codeHash: 'code-hash-first',
        expiresAt: new Date('2026-01-01T00:10:00.000Z'),
        consumedAt: null,
        attempts: 0,
      };
      await repo().save(identifier, first);
      const second: Otp = {
        id: '20202020-2020-4202-8202-202020202020',
        codeHash: 'code-hash-second',
        expiresAt: new Date('2026-01-01T00:20:00.000Z'),
        consumedAt: null,
        attempts: 0,
      };
      await repo().save(identifier, second);

      expect(await repo().findLatestFor(identifier)).toEqual(second);
    });

    it('re-saving the same id (attempts incremented) updates the row, not a new insert', async () => {
      const identifier = 'otp-driver-3@example.com';
      const otp: Otp = {
        id: '30303030-3030-4303-8303-303030303030',
        codeHash: 'code-hash-3',
        expiresAt: new Date('2026-01-01T00:10:00.000Z'),
        consumedAt: null,
        attempts: 0,
      };
      await repo().save(identifier, otp);
      await repo().save(identifier, { ...otp, attempts: 1 });
      await repo().save(identifier, {
        ...otp,
        attempts: 2,
        consumedAt: new Date('2026-01-01T00:05:00.000Z'),
      });

      const stored = await repo().findLatestFor(identifier);
      expect(stored?.attempts).toBe(2);
      expect(stored?.consumedAt).toEqual(new Date('2026-01-01T00:05:00.000Z'));
    });

    it('returns null for an identifier with no OTP requested', async () => {
      expect(await repo().findLatestFor('never-requested@example.com')).toBeNull();
    });
  });

  describe('PostgresDeviceRepository', () => {
    const repo = () => new PostgresDeviceRepository(db);
    const driverId = makeId<'DriverId'>('99999999-9999-4999-8999-999999999999');
    const otherDriverId = makeId<'DriverId'>('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    function device(overrides: Partial<Device> = {}): Device {
      return {
        id: makeId<'DeviceId'>('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
        driverId,
        pushToken: 'ExponentPushToken[round-trip]',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        ...overrides,
      };
    }

    // Devices reference identity.drivers by foreign key — seeded once, here, rather than inline
    // per test the way PostgresSessionRepository's tests do, since these tests share the same
    // two driver ids across several `it`s (reassigning a device between them) and
    // PostgresDriverRepository.save() is insert-only (a second save of the same id throws).
    beforeAll(async () => {
      const driverRepo = new PostgresDriverRepository(db);
      await driverRepo.save({
        id: driverId,
        identifier: 'device-driver-a@example.com',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      await driverRepo.save({
        id: otherDriverId,
        identifier: 'device-driver-b@example.com',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
    });

    it('round-trips a device through save/findByPushToken/findByDriverId', async () => {
      const d = device();
      await repo().save(d);

      expect(await repo().findByPushToken(d.pushToken)).toEqual(d);
      expect(await repo().findByDriverId(driverId)).toEqual([d]);
    });

    it('returns null/empty for an unknown token or driver', async () => {
      expect(await repo().findByPushToken('never-registered')).toBeNull();
      expect(
        await repo().findByDriverId(makeId<'DriverId'>('00000000-0000-4000-8000-000000000001')),
      ).toEqual([]);
    });

    it('re-saving the same push token updates the row rather than inserting a new one', async () => {
      const d = device({
        id: makeId<'DeviceId'>('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
        pushToken: 'ExponentPushToken[upsert]',
      });
      await repo().save(d);

      const reassigned: Device = {
        ...d,
        driverId: otherDriverId,
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      };
      await repo().save(reassigned);

      const found = await repo().findByPushToken(d.pushToken);
      expect(found).toEqual(reassigned);
      expect(await repo().findByDriverId(driverId)).not.toContainEqual(
        expect.objectContaining({ pushToken: 'ExponentPushToken[upsert]' }),
      );
      expect(await repo().findByDriverId(otherDriverId)).toEqual([reassigned]);
    });
  });
});
