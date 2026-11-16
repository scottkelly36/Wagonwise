import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { ActiveTrip } from '../domain/active-trip.js';
import type { RoutePlan } from '../domain/route-plan.js';
import type { PushNotification } from './ports/push-notifier.js';
import { remindOpenTrips } from './remind-open-trips.js';
import { InMemoryActiveTripRepository } from './testing/in-memory-active-trip-repository.js';
import { InMemoryRoutePlanRepository } from './testing/in-memory-route-plan-repository.js';

// 13:00 in November: inside the hours reminders may go out.
const NOW = '2026-11-16T13:00:00.000Z';
const hoursBefore = (h: number) => new Date(new Date(NOW).getTime() - h * 60 * 60 * 1000);

function plan(n: number, durationMin: number): RoutePlan {
  return {
    id: makeId<'RoutePlanId'>(`plan-${n}`),
    driverId: makeId<'DriverId'>(`driver-${n}`),
    profileId: makeId<'VehicleProfileId'>('profile-1'),
    origin: { lat: 54.9707, lon: -2.1013 },
    destination: { lat: 54.9738, lon: -2.0165 },
    geometry: 'encoded-polyline',
    distanceKm: 50,
    durationMin,
    avoidedRestrictions: [],
    maneuvers: [],
    hazardsOnRoute: [],
    createdAt: hoursBefore(30),
  };
}

function trip(n: number, startedHoursAgo: number, endedAt?: Date): ActiveTrip {
  return {
    id: makeId<'ActiveTripId'>(`trip-${n}`),
    routePlanId: makeId<'RoutePlanId'>(`plan-${n}`),
    driverId: makeId<'DriverId'>(`driver-${n}`),
    startedAt: hoursBefore(startedHoursAgo),
    endedAt,
  };
}

async function setUp(
  entries: { trip: ActiveTrip; durationMin: number }[],
  tokens: Record<string, string[]> = {},
) {
  const plans = new InMemoryRoutePlanRepository();
  const trips = new InMemoryActiveTripRepository(plans);
  for (const e of entries) {
    await plans.save(plan(Number(e.trip.id.slice(5)), e.durationMin));
    await trips.save(e.trip);
  }
  const sent: { token: string; notification: PushNotification }[] = [];
  const deps = {
    activeTripRepo: trips,
    identity: { getPushTokensForDriver: (id: string) => Promise.resolve(tokens[id] ?? []) },
    pushNotifier: {
      send: (token: string, notification: PushNotification) => {
        sent.push({ token, notification });
        return Promise.resolve();
      },
    },
    clock: new FakeClock(NOW),
  };
  return { deps, sent, trips };
}

describe('remindOpenTrips', () => {
  it('reminds each of the driver’s phones once a trip is two hours past its planned arrival, quietly', async () => {
    // Started 4 hours ago on a 60-minute route: planned arrival 3 hours ago.
    const { deps, sent } = await setUp([{ trip: trip(1, 4), durationMin: 60 }], {
      'driver-1': ['phone-a', 'phone-b'],
    });
    expect(await remindOpenTrips(deps)).toBe(1);
    expect(sent.map((s) => s.token)).toEqual(['phone-a', 'phone-b']);
    expect(sent[0]?.notification).toMatchObject({
      title: 'Still on your trip?',
      data: { type: 'trip-reminder', tripId: 'trip-1' },
      quiet: true,
    });
  });

  it('never reminds the same trip twice', async () => {
    const { deps, sent } = await setUp([{ trip: trip(1, 4), durationMin: 60 }], {
      'driver-1': ['phone-a'],
    });
    await remindOpenTrips(deps);
    expect(await remindOpenTrips(deps)).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('leaves alone a trip not yet two hours past its planned arrival', async () => {
    // Started 2 hours ago on a 90-minute route: planned arrival 30 minutes ago.
    const { deps, sent } = await setUp([{ trip: trip(1, 2), durationMin: 90 }], {
      'driver-1': ['phone-a'],
    });
    expect(await remindOpenTrips(deps)).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('leaves alone an ended trip, and one over a day old (the server ends those itself)', async () => {
    const { deps, sent } = await setUp(
      [
        { trip: trip(1, 5, hoursBefore(3)), durationMin: 60 },
        { trip: trip(2, 25), durationMin: 60 },
      ],
      { 'driver-1': ['phone-a'], 'driver-2': ['phone-b'] },
    );
    expect(await remindOpenTrips(deps)).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('marks a trip reminded even when the driver has no phone to send to, so it is not tried every 15 minutes', async () => {
    const { deps, sent, trips } = await setUp([{ trip: trip(1, 4), durationMin: 60 }]);
    expect(await remindOpenTrips(deps)).toBe(1);
    expect(sent).toHaveLength(0);
    expect(trips.reminded.has(makeId<'ActiveTripId'>('trip-1'))).toBe(true);
  });

  it('waits for the morning rather than sending at night', async () => {
    const { deps, sent } = await setUp([{ trip: trip(1, 4), durationMin: 60 }], {
      'driver-1': ['phone-a'],
    });
    const night = { ...deps, clock: new FakeClock('2026-11-16T22:30:00.000Z') };
    expect(await remindOpenTrips(night)).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
