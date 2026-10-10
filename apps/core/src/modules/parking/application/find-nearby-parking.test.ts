import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { SafeParkingSpot } from '../domain/safe-parking-spot.js';
import { findNearbySafeParkingSpots } from './find-nearby-parking.js';
import { InMemoryParkingRepository } from './testing/in-memory-parking-repository.js';

function spot(overrides: Partial<SafeParkingSpot> = {}): SafeParkingSpot {
  return {
    id: makeId<'SafeParkingSpotId'>('11111111-1111-4111-8111-111111111111'),
    reporterId: makeId<'DriverId'>('22222222-2222-4222-8222-222222222222'),
    location: { lat: 54.9698, lon: -2.1013 },
    note: undefined,
    reportedAt: new Date('2026-09-27T12:00:00.000Z'),
    source: 'driver',
    ...overrides,
  };
}

describe('findNearbySafeParkingSpots', () => {
  it('returns a spot within radius of the corridor', async () => {
    const repo = new InMemoryParkingRepository();
    await repo.save(spot());

    const found = await findNearbySafeParkingSpots(
      { repo },
      { corridor: [{ lat: 54.9698, lon: -2.1013 }], radiusM: 50 },
    );

    expect(found).toMatchObject([spot()]);
  });

  it('excludes a spot outside the radius', async () => {
    const repo = new InMemoryParkingRepository();
    await repo.save(spot({ location: { lat: 55.5, lon: -1.5 } }));

    const found = await findNearbySafeParkingSpots(
      { repo },
      { corridor: [{ lat: 54.9698, lon: -2.1013 }], radiusM: 50 },
    );

    expect(found).toEqual([]);
  });
});
