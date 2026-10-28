import { describe, expect, it } from 'vitest';
import type { FuelPrice, FuelStation, FuelType } from '../domain/fuel.js';
import { findCheapestFuel, type FindCheapestFuelInput } from './find-cheapest-fuel.js';
import { InMemoryFuelRepository } from './testing/in-memory-fuel-repository.js';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const clock = { now: () => NOW };
const HERE = { lat: 54.97, lon: -2.1 };

const station = (id: string, overrides: Partial<FuelStation> = {}): FuelStation => ({
  id,
  name: `Station ${id}`,
  brand: undefined,
  addressLine: undefined,
  city: undefined,
  postcode: undefined,
  phone: undefined,
  position: HERE,
  isMotorway: false,
  isSupermarket: false,
  closed: false,
  amenities: [],
  ...overrides,
});

const price = (
  stationId: string,
  pencePerLitre: number,
  fuelType: FuelType = 'B7_STANDARD',
  updatedAt = '2026-10-27T08:00:00.000Z',
): FuelPrice => ({ stationId, fuelType, pencePerLitre, updatedAt: new Date(updatedAt) });

const input = (overrides: Partial<FindCheapestFuelInput> = {}): FindCheapestFuelInput => ({
  centre: HERE,
  radiusM: 10_000,
  fuelType: 'B7_STANDARD',
  maxAgeDays: undefined,
  limit: 20,
  ...overrides,
});

function repoWith(stations: FuelStation[], prices: FuelPrice[]): InMemoryFuelRepository {
  const repo = new InMemoryFuelRepository();
  repo.snapshot = { stations, prices };
  repo.refreshedAt = new Date('2026-10-27T11:00:00.000Z');
  return repo;
}

const ids = async (repo: InMemoryFuelRepository, i: FindCheapestFuelInput) =>
  (await findCheapestFuel({ repo, clock }, i)).stations.map((s) => s.station.id);

describe('findCheapestFuel', () => {
  it('lists the stations cheapest first, nearer first when the price ties', async () => {
    const repo = repoWith(
      [
        station('dear'),
        station('cheap-far', { position: { lat: 55.0, lon: -2.1 } }),
        station('cheap-near'),
      ],
      [price('dear', 205), price('cheap-far', 190), price('cheap-near', 190)],
    );
    expect(await ids(repo, input())).toEqual(['cheap-near', 'cheap-far', 'dear']);
  });

  it('reports how far each is, and when the copy was last refreshed', async () => {
    const repo = repoWith(
      [station('a'), station('b', { position: { lat: 54.98, lon: -2.1 } })],
      [price('a', 200), price('b', 201)],
    );
    const found = await findCheapestFuel({ repo, clock }, input());
    expect(found.refreshedAt).toEqual(new Date('2026-10-27T11:00:00.000Z'));
    expect(found.stations[0]?.distanceM).toBe(0);
    expect(found.stations[1]?.distanceM).toBeGreaterThan(1000);
  });

  it('leaves out closed stations, other fuels, and stations beyond the radius', async () => {
    const repo = repoWith(
      [
        station('open'),
        station('closed', { closed: true }),
        station('petrol-only'),
        station('far', { position: { lat: 55.5, lon: -2.1 } }),
      ],
      [
        price('open', 200),
        price('closed', 150),
        price('petrol-only', 150, 'E10'),
        price('far', 150),
      ],
    );
    expect(await ids(repo, input())).toEqual(['open']);
  });

  it('asks for the fuel it was given', async () => {
    const repo = repoWith(
      [station('a'), station('b')],
      [price('a', 200, 'B7_STANDARD'), price('b', 150, 'HVO')],
    );
    expect(await ids(repo, input({ fuelType: 'HVO' }))).toEqual(['b']);
  });

  it('drops a price far below the national median as a typing slip, and keeps a real low one', async () => {
    const slip = station('slip');
    const real = station('real');
    const others = Array.from({ length: 9 }, (_, i) => station(`o${i}`));
    const repo = repoWith(
      [slip, real, ...others],
      [price('slip', 14.29), price('real', 145), ...others.map((s, i) => price(s.id, 195 + i))],
    );
    // Median of the eleven prices is 198; 60% of it is 118.8.
    expect(await ids(repo, input())).toEqual([
      'real',
      'o0',
      'o1',
      'o2',
      'o3',
      'o4',
      'o5',
      'o6',
      'o7',
      'o8',
    ]);
  });

  it('keeps old prices unless asked to drop them, then drops by age from now', async () => {
    const repo = repoWith(
      [station('fresh'), station('week'), station('month')],
      [
        price('fresh', 202, 'B7_STANDARD', '2026-10-27T06:00:00.000Z'),
        price('week', 201, 'B7_STANDARD', '2026-10-21T06:00:00.000Z'),
        price('month', 200, 'B7_STANDARD', '2026-09-20T06:00:00.000Z'),
      ],
    );
    expect(await ids(repo, input())).toEqual(['month', 'week', 'fresh']);
    expect(await ids(repo, input({ maxAgeDays: 7 }))).toEqual(['week', 'fresh']);
    expect(await ids(repo, input({ maxAgeDays: 1 }))).toEqual(['fresh']);
  });

  it('stops at the limit, keeping the cheapest', async () => {
    const all = Array.from({ length: 5 }, (_, i) => station(`s${i}`));
    const repo = repoWith(
      all,
      all.map((s, i) => price(s.id, 200 + i)),
    );
    expect(await ids(repo, input({ limit: 2 }))).toEqual(['s0', 's1']);
  });

  it('answers with nothing before the first refresh', async () => {
    const found = await findCheapestFuel({ repo: new InMemoryFuelRepository(), clock }, input());
    expect(found).toEqual({ stations: [], refreshedAt: undefined });
  });
});
