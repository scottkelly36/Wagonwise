import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { SafeParkingSpot } from '../domain/safe-parking-spot.js';
import { deleteSafeParkingSpot } from './delete-safe-parking-spot.js';
import { InMemoryParkingRepository } from './testing/in-memory-parking-repository.js';

const spot: SafeParkingSpot = {
  id: makeId<'SafeParkingSpotId'>('spot-1'),
  reporterId: makeId<'DriverId'>('driver-1'),
  location: { lat: 54.97, lon: -2.1 },
  note: undefined,
  reportedAt: new Date('2026-10-07T12:00:00.000Z'),
};

describe('deleteSafeParkingSpot', () => {
  it('lets the reporter take their spot back', async () => {
    const repo = new InMemoryParkingRepository();
    await repo.save(spot);
    const result = await deleteSafeParkingSpot(
      { repo },
      { id: spot.id, reporterId: spot.reporterId },
    );
    expect(result).toEqual({ ok: true, value: undefined });
    expect(await repo.findNearbyLine([spot.location], 100)).toEqual([]);
  });

  it('treats someone else’s spot as not found, and leaves it there', async () => {
    const repo = new InMemoryParkingRepository();
    await repo.save(spot);
    const result = await deleteSafeParkingSpot(
      { repo },
      { id: spot.id, reporterId: makeId<'DriverId'>('driver-2') },
    );
    expect(result).toEqual({ ok: false, error: { tag: 'SafeParkingSpotNotFound' } });
    expect(await repo.findNearbyLine([spot.location], 100)).toHaveLength(1);
  });

  it('reports a spot that does not exist as not found', async () => {
    const repo = new InMemoryParkingRepository();
    const result = await deleteSafeParkingSpot(
      { repo },
      { id: spot.id, reporterId: spot.reporterId },
    );
    expect(result).toEqual({ ok: false, error: { tag: 'SafeParkingSpotNotFound' } });
  });
});
