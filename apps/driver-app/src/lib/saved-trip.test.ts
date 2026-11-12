import type { JobDto } from '@wagonwise/contracts/jobs';
import type { ActiveTripDto, RoutePlanDto } from '@wagonwise/contracts/routing';

import type { SavedTrip } from '../db/saved-trip';
import {
  pendingArrivals,
  SAVED_TRIP_MAX_AGE_MS,
  usableSavedTrip,
  waitingNotice,
  withPendingArrival,
} from './saved-trip';

const now = new Date('2026-11-12T12:00:00.000Z');
const saved = (
  overrides: Partial<ActiveTripDto> = {},
  savedAt = '2026-11-12T11:00:00.000Z',
): SavedTrip => ({
  trip: { id: 'trip-1', driverId: 'driver-1', ...overrides } as ActiveTripDto,
  plan: {} as RoutePlanDto,
  savedAt,
});

describe('usableSavedTrip', () => {
  it('brings back this driver’s recent trip', () => {
    expect(usableSavedTrip(saved(), 'driver-1', [], now)?.trip.id).toBe('trip-1');
  });

  it('brings back nothing when nothing was saved', () => {
    expect(usableSavedTrip(undefined, 'driver-1', [], now)).toBeUndefined();
  });

  it('never gives one driver’s trip to another signing in on the same phone', () => {
    expect(usableSavedTrip(saved(), 'driver-2', [], now)).toBeUndefined();
  });

  it('does not bring back a trip that is already over', () => {
    expect(
      usableSavedTrip(saved({ endedAt: '2026-11-12T11:30:00.000Z' }), 'driver-1', [], now),
    ).toBeUndefined();
  });

  it('does not bring back a trip the driver ended with no signal, whatever the server has yet to hear', () => {
    expect(usableSavedTrip(saved(), 'driver-1', [{ tripId: 'trip-1' }], now)).toBeUndefined();
    expect(usableSavedTrip(saved(), 'driver-1', [{ tripId: 'other' }], now)?.trip.id).toBe(
      'trip-1',
    );
  });

  it('drops a trip left on the phone for more than a day, and one saved in the future', () => {
    const old = new Date(now.getTime() - SAVED_TRIP_MAX_AGE_MS - 1000).toISOString();
    expect(usableSavedTrip(saved({}, old), 'driver-1', [], now)).toBeUndefined();
    expect(
      usableSavedTrip(saved({}, '2026-11-13T12:00:00.000Z'), 'driver-1', [], now),
    ).toBeUndefined();
    expect(usableSavedTrip(saved({}, 'not a date'), 'driver-1', [], now)).toBeUndefined();
  });
});

describe('the arrival shown while it waits to be sent', () => {
  const job = { id: 'job-1', status: 'en_route' } as JobDto;

  it('shows the status the driver moved the job to', () => {
    expect(withPendingArrival(job, { 'job-1': 'at_delivery' }).status).toBe('at_delivery');
  });

  it('leaves the job alone when nothing is waiting for it, or the server already agrees', () => {
    expect(withPendingArrival(job, {})).toBe(job);
    expect(withPendingArrival(job, { 'job-2': 'at_delivery' })).toBe(job);
    expect(withPendingArrival(job, { 'job-1': 'en_route' })).toBe(job);
  });

  it('lists the status for each job with an arrival waiting, and nothing for a plain end', () => {
    expect(
      pendingArrivals([
        { tripId: 'a' },
        { tripId: 'b', jobAdvance: { jobId: 'job-1', status: 'at_pickup' } },
      ]),
    ).toEqual({ 'job-1': 'at_pickup' });
  });
});

describe('waitingNotice', () => {
  it('says nothing when nothing is saved', () => {
    expect(waitingNotice([])).toBeUndefined();
  });

  it('says a trip end is saved, and that it will go when there is signal', () => {
    expect(waitingNotice([{ tripId: 'a' }])).toBe(
      'Your trip end is saved. It will be sent when you have signal.',
    );
  });

  it('says an arrival is saved when it is one', () => {
    expect(
      waitingNotice([{ tripId: 'a', jobAdvance: { jobId: 'job-1', status: 'at_delivery' } }]),
    ).toBe('Your arrival is saved. It will be sent when you have signal.');
  });

  it('counts them when there are several', () => {
    expect(waitingNotice([{ tripId: 'a' }, { tripId: 'b' }])).toBe(
      '2 things are saved on your phone. They will be sent when you have signal.',
    );
  });
});
