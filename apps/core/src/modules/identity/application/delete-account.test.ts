import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { Device } from '../domain/device.js';
import type { Driver } from '../domain/driver.js';
import type { Session } from '../domain/session.js';
import { deleteAccount, type DeleteAccountDeps } from './delete-account.js';
import { RecordingDriverDataEraser } from './testing/recording-driver-data-eraser.js';
import { InMemoryDeviceRepository } from './testing/in-memory-device-repository.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';
import { InMemorySessionRepository } from './testing/in-memory-session-repository.js';

const now = new Date('2026-06-15T08:00:00.000Z');

function driver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: makeId<'DriverId'>('driver-1'),
    identifier: 'driver1@example.com',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

function activeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: makeId<'SessionId'>('session-1'),
    driverId: makeId<'DriverId'>('driver-1'),
    refreshTokenHash: 'hash',
    previousRefreshTokenHash: null,
    issuedAt: new Date('2026-06-01T00:00:00.000Z'),
    lastUsedAt: new Date('2026-06-01T00:00:00.000Z'),
    refreshExpiresAt: new Date('2026-08-01T00:00:00.000Z'),
    revokedAt: null,
    ...overrides,
  };
}

function device(overrides: Partial<Device> = {}): Device {
  return {
    id: makeId<'DeviceId'>('device-1'),
    driverId: makeId<'DriverId'>('driver-1'),
    pushToken: 'ExponentPushToken[abc]',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildDeps(overrides: Partial<DeleteAccountDeps> = {}): DeleteAccountDeps {
  return {
    driverRepo: new InMemoryDriverRepository(),
    sessionRepo: new InMemorySessionRepository(),
    deviceRepo: new InMemoryDeviceRepository(),
    dataEraser: new RecordingDriverDataEraser(),
    clock: new FakeClock(now),
    ...overrides,
  };
}

describe('deleteAccount', () => {
  it('reports DriverNotFound for an unknown driver', async () => {
    const deps = buildDeps();
    const result = await deleteAccount(deps, { driverId: makeId<'DriverId'>('nope') });
    expect(result).toEqual({ ok: false, error: { tag: 'DriverNotFound' } });
  });

  it('anonymizes the driver, revokes every session and deletes every device', async () => {
    const driverRepo = new InMemoryDriverRepository();
    const sessionRepo = new InMemorySessionRepository();
    const deviceRepo = new InMemoryDeviceRepository();
    const d = driver();
    const session = activeSession();
    const dev = device();
    await driverRepo.save(d);
    await sessionRepo.save(session);
    await deviceRepo.save(dev);
    const deps = buildDeps({ driverRepo, sessionRepo, deviceRepo });

    const result = await deleteAccount(deps, { driverId: d.id });
    expect(result).toEqual({ ok: true, value: undefined });

    const savedDriver = await driverRepo.findById(d.id);
    expect(savedDriver?.identifier).toBe(`deleted:${d.id}`);
    expect(savedDriver?.deletedAt).toEqual(now);

    const savedSession = await sessionRepo.findById(session.id);
    expect(savedSession?.revokedAt).toEqual(now);

    expect(await deviceRepo.findByDriverId(d.id)).toEqual([]);
  });

  it('revokes every session for the driver, not just one', async () => {
    const driverRepo = new InMemoryDriverRepository();
    const sessionRepo = new InMemorySessionRepository();
    const d = driver();
    const first = activeSession({ id: makeId<'SessionId'>('session-1') });
    const second = activeSession({
      id: makeId<'SessionId'>('session-2'),
      refreshTokenHash: 'hash-2',
    });
    await driverRepo.save(d);
    await sessionRepo.save(first);
    await sessionRepo.save(second);
    const deps = buildDeps({ driverRepo, sessionRepo });

    await deleteAccount(deps, { driverId: d.id });

    expect((await sessionRepo.findById(first.id))?.revokedAt).toEqual(now);
    expect((await sessionRepo.findById(second.id))?.revokedAt).toEqual(now);
  });

  it('erases the data held elsewhere, using the identifier from before it is scrubbed', async () => {
    const driverRepo = new InMemoryDriverRepository();
    const d = driver();
    await driverRepo.save(d);
    const dataEraser = new RecordingDriverDataEraser();

    await deleteAccount(buildDeps({ driverRepo, dataEraser }), { driverId: d.id });

    expect(dataEraser.erased).toEqual([{ driverId: d.id, identifier: 'driver1@example.com' }]);
  });

  it('leaves the account intact when erasing fails, so the whole deletion can be retried', async () => {
    const driverRepo = new InMemoryDriverRepository();
    const sessionRepo = new InMemorySessionRepository();
    const d = driver();
    const session = activeSession();
    await driverRepo.save(d);
    await sessionRepo.save(session);
    const dataEraser = new RecordingDriverDataEraser();
    dataEraser.failWith = new Error('database unavailable');

    await expect(
      deleteAccount(buildDeps({ driverRepo, sessionRepo, dataEraser }), { driverId: d.id }),
    ).rejects.toThrow('database unavailable');
    expect((await driverRepo.findById(d.id))?.deletedAt).toBeUndefined();
    expect((await sessionRepo.findById(session.id))?.revokedAt).toBeNull();

    // The retry: the failure is gone, and now the whole deletion goes through.
    dataEraser.failWith = undefined;
    await deleteAccount(buildDeps({ driverRepo, sessionRepo, dataEraser }), { driverId: d.id });
    expect((await driverRepo.findById(d.id))?.deletedAt).toEqual(now);
    expect(dataEraser.erased).toHaveLength(1);
  });

  it('is idempotent: deleting an already-deleted account succeeds without re-anonymizing', async () => {
    const driverRepo = new InMemoryDriverRepository();
    const earlier = new Date('2026-06-10T00:00:00.000Z');
    const d = driver({ identifier: `deleted:driver-1`, deletedAt: earlier });
    await driverRepo.save(d);
    const deps = buildDeps({ driverRepo });

    const result = await deleteAccount(deps, { driverId: d.id });
    expect(result).toEqual({ ok: true, value: undefined });

    const saved = await driverRepo.findById(d.id);
    expect(saved?.deletedAt).toEqual(earlier); // unchanged, not bumped to `now`
  });
});
