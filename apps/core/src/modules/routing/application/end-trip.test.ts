import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { ActiveTrip } from '../domain/active-trip.js';
import { InMemoryActiveTripRepository } from './testing/in-memory-active-trip-repository.js';
import { endTrip, type EndTripDeps } from './end-trip.js';

const driverId = makeId<'DriverId'>('driver-1');
const otherDriverId = makeId<'DriverId'>('driver-2');
const tripId = makeId<'ActiveTripId'>('trip-1');
const startedAt = new Date('2026-06-15T08:00:00.000Z');
const endedAt = new Date('2026-06-15T09:00:00.000Z');

function trip(overrides: Partial<ActiveTrip> = {}): ActiveTrip {
  return {
    id: tripId,
    routePlanId: makeId<'RoutePlanId'>('plan-1'),
    driverId,
    startedAt,
    ...overrides,
  };
}

async function seeded(t: ActiveTrip = trip()): Promise<EndTripDeps> {
  const repo = new InMemoryActiveTripRepository();
  await repo.save(t);
  return { repo, clock: new FakeClock(endedAt) };
}

describe('endTrip', () => {
  it('ends an active trip owned by the caller', async () => {
    const deps = await seeded();
    const result = await endTrip(deps, { id: tripId, driverId });
    expect(result).toEqual({ ok: true, value: trip({ endedAt }) });
    expect(await deps.repo.findById(tripId)).toEqual(trip({ endedAt }));
  });

  it('returns ActiveTripNotFound for an unknown id', async () => {
    const deps = await seeded();
    const result = await endTrip(deps, { id: makeId<'ActiveTripId'>('nope'), driverId });
    expect(result).toEqual({ ok: false, error: { tag: 'ActiveTripNotFound' } });
  });

  it('returns ActiveTripNotFound and leaves the trip alone when the driverId does not match', async () => {
    const deps = await seeded();
    const result = await endTrip(deps, { id: tripId, driverId: otherDriverId });
    expect(result).toEqual({ ok: false, error: { tag: 'ActiveTripNotFound' } });
    expect(await deps.repo.findById(tripId)).toEqual(trip());
  });

  describe('an end the app held until it had signal', () => {
    it('records when the driver ended it, not when the signal came back', async () => {
      const deps = await seeded();
      const tapped = new Date('2026-06-15T08:40:00.000Z');
      const result = await endTrip(deps, { id: tripId, driverId, endedAt: tapped });
      expect(result).toEqual({ ok: true, value: trip({ endedAt: tapped }) });
      expect(await deps.repo.findById(tripId)).toEqual(trip({ endedAt: tapped }));
    });

    it('keeps it between the start and now, so a wrong phone clock cannot undo the trip', async () => {
      const early = await endTrip(await seeded(), {
        id: tripId,
        driverId,
        endedAt: new Date('2026-06-15T07:00:00.000Z'),
      });
      expect(early).toEqual({ ok: true, value: trip({ endedAt: startedAt }) });

      const late = await endTrip(await seeded(), {
        id: tripId,
        driverId,
        endedAt: new Date('2026-06-15T23:00:00.000Z'),
      });
      expect(late).toEqual({ ok: true, value: trip({ endedAt }) });
    });

    it('leaves a trip that already has an end alone, so a retry cannot move it', async () => {
      const first = new Date('2026-06-15T08:30:00.000Z');
      const deps = await seeded(trip({ endedAt: first }));
      const result = await endTrip(deps, {
        id: tripId,
        driverId,
        endedAt: new Date('2026-06-15T08:50:00.000Z'),
      });
      expect(result).toEqual({ ok: true, value: trip({ endedAt: first }) });
      expect(await deps.repo.findById(tripId)).toEqual(trip({ endedAt: first }));
    });

    it('still refuses another driver’s trip', async () => {
      const deps = await seeded();
      const result = await endTrip(deps, {
        id: tripId,
        driverId: otherDriverId,
        endedAt: new Date('2026-06-15T08:40:00.000Z'),
      });
      expect(result).toEqual({ ok: false, error: { tag: 'ActiveTripNotFound' } });
    });
  });

  it('moves endedAt to now when a trip is already ended', async () => {
    const deps = await seeded(trip({ endedAt: new Date('2026-06-15T08:30:00.000Z') }));
    const result = await endTrip(deps, { id: tripId, driverId });
    expect(result).toEqual({ ok: true, value: trip({ endedAt }) });
  });
});
