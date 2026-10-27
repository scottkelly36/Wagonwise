import { describe, expect, it } from 'vitest';
import { err, ok, type Result } from '../../../shared/result.js';
import type { FuelPrice, FuelSourceUnavailable, FuelStation, FuelType } from '../domain/fuel.js';
import type { FuelSource } from './fuel-source.js';
import { loadFuelSnapshot } from './load-snapshot.js';

const station = (id: string, name = `Station ${id}`): FuelStation => ({
  id,
  name,
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

const price = (
  stationId: string,
  fuelType: FuelType,
  pencePerLitre: number,
  updatedAt = '2026-10-27T08:00:00.000Z',
): FuelPrice => ({ stationId, fuelType, pencePerLitre, updatedAt: new Date(updatedAt) });

const unavailable: Result<never, FuelSourceUnavailable> = err({ tag: 'FuelSourceUnavailable' });

function source(
  stations: Result<readonly FuelStation[], FuelSourceUnavailable>,
  prices: Result<readonly FuelPrice[], FuelSourceUnavailable>,
): FuelSource {
  return {
    enabled: true,
    fetchStations: () => Promise.resolve(stations),
    fetchPrices: () => Promise.resolve(prices),
  };
}

describe('loadFuelSnapshot', () => {
  it('gives every station once and every price that has a station', async () => {
    const result = await loadFuelSnapshot(
      source(
        ok([station('a'), station('b')]),
        ok([price('a', 'B7_STANDARD', 198.9), price('b', 'E10', 167.9)]),
      ),
    );
    expect(result.ok && result.value.stations.map((s) => s.id)).toEqual(['a', 'b']);
    expect(result.ok && result.value.prices).toHaveLength(2);
  });

  it('drops a price for a station it never saw', async () => {
    const result = await loadFuelSnapshot(
      source(ok([station('a')]), ok([price('a', 'E10', 167.9), price('ghost', 'E10', 150)])),
    );
    expect(result.ok && result.value.prices.map((p) => p.stationId)).toEqual(['a']);
  });

  it('merges a station seen twice, keeping the later sighting', async () => {
    const result = await loadFuelSnapshot(
      source(ok([station('a', 'Old name'), station('a', 'New name')]), ok([])),
    );
    expect(result.ok && result.value.stations).toHaveLength(1);
    expect(result.ok && result.value.stations[0]?.name).toBe('New name');
  });

  it('keeps the newest price when a station and fuel appear twice, whichever order they arrive in', async () => {
    const older = price('a', 'B7_STANDARD', 205, '2026-10-26T08:00:00.000Z');
    const newer = price('a', 'B7_STANDARD', 198.9, '2026-10-27T08:00:00.000Z');
    for (const prices of [
      [older, newer],
      [newer, older],
    ]) {
      const result = await loadFuelSnapshot(source(ok([station('a')]), ok(prices)));
      expect(result.ok && result.value.prices).toEqual([newer]);
    }
  });

  it('keeps different fuels at the same station apart', async () => {
    const result = await loadFuelSnapshot(
      source(ok([station('a')]), ok([price('a', 'E10', 167.9), price('a', 'B7_STANDARD', 198.9)])),
    );
    expect(result.ok && result.value.prices).toHaveLength(2);
  });

  it('fails as a whole when the stations cannot be fetched', async () => {
    const result = await loadFuelSnapshot(source(unavailable, ok([])));
    expect(result).toEqual({ ok: false, error: { tag: 'FuelSourceUnavailable' } });
  });

  it('fails as a whole when the prices cannot be fetched, rather than giving stations with no prices', async () => {
    const result = await loadFuelSnapshot(source(ok([station('a')]), unavailable));
    expect(result).toEqual({ ok: false, error: { tag: 'FuelSourceUnavailable' } });
  });
});
