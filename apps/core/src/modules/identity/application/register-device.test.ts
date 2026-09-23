import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { registerDevice, type RegisterDeviceDeps } from './register-device.js';
import { InMemoryDeviceRepository } from './testing/in-memory-device-repository.js';

const driverId = makeId<'DriverId'>('driver-1');
const otherDriverId = makeId<'DriverId'>('driver-2');
const now = new Date('2026-06-15T08:00:00.000Z');

function buildDeps(overrides: Partial<RegisterDeviceDeps> = {}): RegisterDeviceDeps {
  return {
    repo: new InMemoryDeviceRepository(),
    clock: new FakeClock(now),
    ids: new SequentialIdGenerator(),
    ...overrides,
  };
}

describe('registerDevice', () => {
  it('creates and persists a device with a generated id', async () => {
    const deps = buildDeps();
    const result = await registerDevice(deps, {
      driverId,
      pushToken: '  ExponentPushToken[abc123]  ',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        id: '00000000-0000-4000-8000-000000000001',
        driverId,
        pushToken: 'ExponentPushToken[abc123]', // trimmed
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  it('rejects a blank push token without touching the repository', async () => {
    const deps = buildDeps();
    const result = await registerDevice(deps, { driverId, pushToken: '   ' });
    expect(result).toEqual({ ok: false, error: { tag: 'InvalidPushToken' } });
    expect(await deps.repo.findByDriverId(driverId)).toEqual([]);
  });

  it('re-registering the same token refreshes updatedAt rather than creating a second row', async () => {
    const clock = new FakeClock(now);
    const deps = buildDeps({ clock });
    const first = await registerDevice(deps, { driverId, pushToken: 'token-1' });
    expect(first.ok).toBe(true);

    clock.advance(60_000);
    const second = await registerDevice(deps, { driverId, pushToken: 'token-1' });
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.value.id).toBe(first.value.id);
    expect(second.value.createdAt).toEqual(first.value.createdAt);
    expect(second.value.updatedAt).not.toEqual(first.value.updatedAt);
    expect(await deps.repo.findByDriverId(driverId)).toHaveLength(1);
  });

  it('reassigns a token to a new driver rather than duplicating it', async () => {
    const deps = buildDeps();
    const first = await registerDevice(deps, { driverId, pushToken: 'shared-device-token' });
    expect(first.ok).toBe(true);

    const reassigned = await registerDevice(deps, {
      driverId: otherDriverId,
      pushToken: 'shared-device-token',
    });
    expect(reassigned.ok).toBe(true);
    if (!first.ok || !reassigned.ok) return;

    expect(reassigned.value.id).toBe(first.value.id);
    expect(reassigned.value.driverId).toBe(otherDriverId);
    expect(await deps.repo.findByDriverId(driverId)).toEqual([]);
    expect(await deps.repo.findByDriverId(otherDriverId)).toEqual([reassigned.value]);
  });
});
