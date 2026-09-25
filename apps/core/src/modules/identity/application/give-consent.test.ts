import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { Driver } from '../domain/driver.js';
import { giveConsent, type GiveConsentDeps } from './give-consent.js';
import { InMemoryDriverRepository } from './testing/in-memory-driver-repository.js';

const now = new Date('2026-06-15T08:00:00.000Z');

function driver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: makeId<'DriverId'>('driver-1'),
    identifier: 'driver1@example.com',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

function buildDeps(overrides: Partial<GiveConsentDeps> = {}): GiveConsentDeps {
  return {
    driverRepo: new InMemoryDriverRepository(),
    clock: new FakeClock(now),
    ...overrides,
  };
}

describe('giveConsent', () => {
  it('reports DriverNotFound for an unknown driver', async () => {
    const deps = buildDeps();
    const result = await giveConsent(deps, { driverId: makeId<'DriverId'>('nope') });
    expect(result).toEqual({ ok: false, error: { tag: 'DriverNotFound' } });
  });

  it('sets consentedAt and persists it', async () => {
    const driverRepo = new InMemoryDriverRepository();
    const d = driver();
    await driverRepo.save(d);
    const deps = buildDeps({ driverRepo });

    const result = await giveConsent(deps, { driverId: d.id });
    expect(result).toEqual({ ok: true, value: { ...d, consentedAt: now } });

    const saved = await driverRepo.findById(d.id);
    expect(saved?.consentedAt).toEqual(now);
  });

  it('is idempotent: consenting again just moves consentedAt forward', async () => {
    const driverRepo = new InMemoryDriverRepository();
    const earlier = new Date('2026-06-10T00:00:00.000Z');
    const d = driver({ consentedAt: earlier });
    await driverRepo.save(d);
    const deps = buildDeps({ driverRepo });

    const result = await giveConsent(deps, { driverId: d.id });
    expect(result).toEqual({ ok: true, value: { ...d, consentedAt: now } });
  });
});
