import { describe, expect, it } from 'vitest';
import { err, ok, type Result } from '../../../shared/result.js';
import type { FuelPrice, FuelSourceUnavailable, FuelStation } from '../domain/fuel.js';
import type { FuelSource } from './fuel-source.js';
import { MIN_STATIONS, refreshFuelPrices } from './refresh-fuel-prices.js';
import { InMemoryFuelRepository } from './testing/in-memory-fuel-repository.js';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const clock = { now: () => NOW };

const station = (id: string): FuelStation => ({
  id,
  name: `Station ${id}`,
  brand: undefined,
  addressLine: undefined,
  city: undefined,
  postcode: undefined,
  phone: undefined,
  position: { lat: 54.97, lon: -2.1 },
  isMotorway: false,
  isSupermarket: false,
  closed: false,
  amenities: [],
});
const stations = (n: number) => Array.from({ length: n }, (_, i) => station(`s${i}`));
const priceFor = (stationId: string): FuelPrice => ({
  stationId,
  fuelType: 'B7_STANDARD',
  pencePerLitre: 198.9,
  updatedAt: new Date('2026-10-27T08:00:00.000Z'),
});

const unavailable: Result<never, FuelSourceUnavailable> = err({ tag: 'FuelSourceUnavailable' });

function source(
  s: Result<readonly FuelStation[], FuelSourceUnavailable>,
  p: Result<readonly FuelPrice[], FuelSourceUnavailable> = ok([]),
): FuelSource {
  return {
    enabled: true,
    fetchStations: () => Promise.resolve(s),
    fetchPrices: () => Promise.resolve(p),
  };
}

describe('refreshFuelPrices', () => {
  it('stores the snapshot and says when and how much', async () => {
    const repo = new InMemoryFuelRepository();
    const all = stations(MIN_STATIONS);
    const result = await refreshFuelPrices({
      source: source(ok(all), ok([priceFor('s0'), priceFor('s1')])),
      repo,
      clock,
    });
    expect(result).toEqual({
      ok: true,
      value: { stations: MIN_STATIONS, prices: 2, refreshedAt: NOW },
    });
    expect(repo.snapshot.stations).toHaveLength(MIN_STATIONS);
    expect(repo.refreshedAt).toEqual(NOW);
  });

  it('replaces what is stored with the newer answer', async () => {
    const repo = new InMemoryFuelRepository();
    const first = await refreshFuelPrices({ source: source(ok(stations(600))), repo, clock });
    const second = await refreshFuelPrices({ source: source(ok(stations(700))), repo, clock });
    expect(first.ok && second.ok).toBe(true);
    expect(repo.snapshot.stations).toHaveLength(700);
  });

  it('leaves the stored copy alone when Fuel Finder cannot be reached', async () => {
    const repo = new InMemoryFuelRepository();
    await refreshFuelPrices({ source: source(ok(stations(600))), repo, clock });
    const result = await refreshFuelPrices({ source: source(unavailable), repo, clock });
    expect(result).toEqual({ ok: false, error: { tag: 'FuelSourceUnavailable' } });
    expect(repo.snapshot.stations).toHaveLength(600);
    expect(repo.replaceCalls).toBe(1);
  });

  it('refuses a nearly empty answer, even on the very first refresh', async () => {
    const repo = new InMemoryFuelRepository();
    const result = await refreshFuelPrices({
      source: source(ok(stations(MIN_STATIONS - 1))),
      repo,
      clock,
    });
    expect(result).toEqual({
      ok: false,
      error: { tag: 'SnapshotTooSmall', received: MIN_STATIONS - 1, stored: 0 },
    });
    expect(repo.replaceCalls).toBe(0);
  });

  it('refuses an answer under half the size of what is stored, and keeps the old copy', async () => {
    const repo = new InMemoryFuelRepository();
    await refreshFuelPrices({ source: source(ok(stations(1200))), repo, clock });
    const result = await refreshFuelPrices({ source: source(ok(stations(599))), repo, clock });
    expect(result).toEqual({
      ok: false,
      error: { tag: 'SnapshotTooSmall', received: 599, stored: 1200 },
    });
    expect(repo.snapshot.stations).toHaveLength(1200);
  });

  it('accepts a drop to exactly half, since a real clear-out is not that rare', async () => {
    const repo = new InMemoryFuelRepository();
    await refreshFuelPrices({ source: source(ok(stations(1200))), repo, clock });
    const result = await refreshFuelPrices({ source: source(ok(stations(600))), repo, clock });
    expect(result.ok).toBe(true);
  });
});
