import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { ActiveTrip } from '../domain/active-trip.js';
import { ABANDONED_TRIP_AGE_MS, endAbandonedTrips } from './housekeeping.js';
import { InMemoryActiveTripRepository } from './testing/in-memory-active-trip-repository.js';

const NOW = '2026-11-16T15:00:00.000Z';
const hoursBefore = (h: number) => new Date(new Date(NOW).getTime() - h * 60 * 60 * 1000);

function trip(n: number, startedHoursAgo: number, endedAt?: Date): ActiveTrip {
  return {
    id: makeId<'ActiveTripId'>(`trip-${n}`),
    routePlanId: makeId<'RoutePlanId'>(`plan-${n}`),
    driverId: makeId<'DriverId'>(`driver-${n}`),
    startedAt: hoursBefore(startedHoursAgo),
    endedAt,
  };
}

describe('endAbandonedTrips', () => {
  async function setUp(...trips: ActiveTrip[]) {
    const repo = new InMemoryActiveTripRepository();
    for (const t of trips) await repo.save(t);
    return { repo, deps: { repo, clock: new FakeClock(NOW) } };
  }

  it('ends a trip started more than a day ago, at the moment it is found', async () => {
    const { repo, deps } = await setUp(trip(1, 25));
    expect(await endAbandonedTrips(deps)).toBe(1);
    expect((await repo.findById(makeId<'ActiveTripId'>('trip-1')))?.endedAt).toEqual(new Date(NOW));
  });

  it('leaves a trip started within the last day running, however long it has been going', async () => {
    const { repo, deps } = await setUp(trip(1, 23.9), trip(2, 10), trip(3, 0));
    expect(await endAbandonedTrips(deps)).toBe(0);
    for (const n of [1, 2, 3]) {
      expect((await repo.findById(makeId<'ActiveTripId'>(`trip-${n}`)))?.endedAt).toBeUndefined();
    }
  });

  it('never moves the end of a trip the driver already ended', async () => {
    const ended = hoursBefore(40);
    const { repo, deps } = await setUp(trip(1, 48, ended));
    expect(await endAbandonedTrips(deps)).toBe(0);
    expect((await repo.findById(makeId<'ActiveTripId'>('trip-1')))?.endedAt).toEqual(ended);
  });

  it('frees the driver to start a new trip', async () => {
    const { repo, deps } = await setUp(trip(1, 30));
    await endAbandonedTrips(deps);
    expect(await repo.findActiveForDriver(makeId<'DriverId'>('driver-1'))).toBeNull();
  });

  it('matches the 24 hours after which the driver app stops bringing back a trip saved on the phone', () => {
    expect(ABANDONED_TRIP_AGE_MS).toBe(24 * 60 * 60 * 1000);
  });
});
