import { arrivalNudgeFor } from './job-arrival-geofence';

const PICKUP_LOCATION = { lat: 54.97, lon: -2.1 };
const DELIVERY_LOCATION = { lat: 55.0, lon: -1.6 };
const STOPS = [
  { kind: 'pickup' as const, name: 'Depot', location: PICKUP_LOCATION },
  { kind: 'delivery' as const, name: 'Port', location: DELIVERY_LOCATION },
];
const FAR_AWAY = { lat: 50.0, lon: 0.0 };

describe('arrivalNudgeFor', () => {
  it('prompts "arrived at pickup" once close to the pickup stop while accepted', () => {
    const job = { id: 'job-1', status: 'accepted' as const, stops: STOPS, currentStop: 0 };
    expect(arrivalNudgeFor(job, PICKUP_LOCATION)).toEqual({
      to: 'at_pickup',
      promptTitle: 'Arrived at pickup?',
    });
  });

  it('prompts "arrived" once close to the delivery stop while en route', () => {
    const job = { id: 'job-1', status: 'en_route' as const, stops: STOPS, currentStop: 1 };
    expect(arrivalNudgeFor(job, DELIVERY_LOCATION)).toEqual({
      to: 'at_delivery',
      promptTitle: 'Arrived?',
    });
  });

  it('does not prompt while far from the relevant stop', () => {
    const job = { id: 'job-1', status: 'accepted' as const, stops: STOPS, currentStop: 0 };
    expect(arrivalNudgeFor(job, FAR_AWAY)).toBeUndefined();
  });

  it('does not prompt near the pickup while en route (the delivery is what matters now)', () => {
    const job = { id: 'job-1', status: 'en_route' as const, stops: STOPS, currentStop: 1 };
    expect(arrivalNudgeFor(job, PICKUP_LOCATION)).toBeUndefined();
  });

  it('does not prompt for a status with no location-triggered step', () => {
    for (const status of ['assigned', 'at_pickup', 'loaded', 'at_delivery', 'delivered'] as const) {
      const job = { id: 'job-1', status, stops: STOPS, currentStop: 1 };
      expect(arrivalNudgeFor(job, PICKUP_LOCATION)).toBeUndefined();
      expect(arrivalNudgeFor(job, DELIVERY_LOCATION)).toBeUndefined();
    }
  });

  it('does not prompt with no job or no position', () => {
    const job = { id: 'job-1', status: 'accepted' as const, stops: STOPS, currentStop: 0 };
    expect(arrivalNudgeFor(undefined, PICKUP_LOCATION)).toBeUndefined();
    expect(arrivalNudgeFor(job, undefined)).toBeUndefined();
  });
});
