import type { JobDto } from '@wagonwise/contracts/jobs';

import {
  isLastStop,
  jobStatusLabel,
  matchesJobStatusTrigger,
  nextStepFor,
  stopProgress,
} from './job-status';

type Stops = JobDto['stops'];
const pickup = { kind: 'pickup', name: 'Quarry', location: { lat: 54, lon: -2 } };
const delivery = { kind: 'delivery', name: 'Depot', location: { lat: 55, lon: -2 } };
const second = { kind: 'delivery', name: 'Mart', location: { lat: 55.1, lon: -2 } };
const simple = [pickup, delivery] as unknown as Stops;
const drops = [pickup, delivery, second] as unknown as Stops;
const deliveryOnly = [delivery] as unknown as Stops;

const at = (status: JobDto['status'], stops: Stops = simple, currentStop = 0) => ({
  status,
  stops,
  currentStop,
});

describe('matchesJobStatusTrigger', () => {
  it('matches a natural phrase for the current status', () => {
    expect(matchesJobStatusTrigger('loaded and leaving', at('loaded', simple, 1))).toBe(true);
    expect(matchesJobStatusTrigger('loaded and leaving', at('at_pickup'))).toBe(true);
    expect(matchesJobStatusTrigger("I've just arrived at the pickup", at('accepted'))).toBe(true);
    expect(matchesJobStatusTrigger('delivered it', at('at_delivery', simple, 1))).toBe(true);
    expect(matchesJobStatusTrigger('setting off now', at('loaded', simple, 1))).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchesJobStatusTrigger('LOADED', at('at_pickup'))).toBe(true);
  });

  it('does not match on an unrelated word boundary', () => {
    // "unloaded" must not match "loaded" as a substring.
    expect(matchesJobStatusTrigger('the trailer got unloaded by mistake', at('at_pickup'))).toBe(
      false,
    );
  });

  it('does not match a phrase for a different status', () => {
    expect(matchesJobStatusTrigger('delivered it', at('loaded', simple, 1))).toBe(false);
  });

  it('returns false for a status with no next step', () => {
    expect(matchesJobStatusTrigger('loaded and leaving', at('delivered', simple, 2))).toBe(false);
    expect(matchesJobStatusTrigger('loaded and leaving', at('draft'))).toBe(false);
  });

  it('returns false for an unrelated transcript', () => {
    expect(matchesJobStatusTrigger('turn the radio up', at('loaded', simple, 1))).toBe(false);
  });

  it('hears "arrived" at the next collection as arriving at a pickup', () => {
    const twoCollections = [pickup, pickup, delivery] as unknown as Stops;
    expect(
      matchesJobStatusTrigger('arrived at the quarry', at('en_route', twoCollections, 1)),
    ).toBe(true);
  });
});

describe('nextStepFor', () => {
  it('walks accept, arrive, load, set off, arrive, deliver for a simple job', () => {
    expect(nextStepFor(at('assigned'))?.label).toBe('Accept job');
    expect(nextStepFor(at('accepted'))).toEqual({ to: 'at_pickup', label: 'Arrived at pickup' });
    expect(nextStepFor(at('at_pickup'))).toEqual({ to: 'loaded', label: 'Loaded' });
    expect(nextStepFor(at('loaded', simple, 1))).toEqual({ to: 'en_route', label: 'Set off' });
    expect(nextStepFor(at('en_route', simple, 1))).toEqual({ to: 'at_delivery', label: 'Arrived' });
    expect(nextStepFor(at('at_delivery', simple, 1))).toEqual({
      to: 'delivered',
      label: 'Delivered',
    });
  });

  it('goes straight from accepted to loaded when the job starts with a delivery', () => {
    expect(nextStepFor(at('accepted', deliveryOnly))).toEqual({
      to: 'loaded',
      label: 'Loaded and ready',
    });
  });

  it('after a delivery that is not the last, the driver is loaded and ready to set off again', () => {
    expect(nextStepFor(at('at_delivery', drops, 1))).toEqual({ to: 'loaded', label: 'Delivered' });
    expect(nextStepFor(at('at_delivery', drops, 2))).toEqual({
      to: 'delivered',
      label: 'Delivered',
    });
  });

  it('has nothing once the job is over or before it is assigned', () => {
    expect(nextStepFor(at('delivered', simple, 2))).toBeUndefined();
    expect(nextStepFor(at('draft'))).toBeUndefined();
  });
});

describe('labels and progress', () => {
  it('says an accepted job that starts with a delivery is not loaded yet', () => {
    expect(jobStatusLabel(at('accepted', deliveryOnly))).toBe('Accepted, not loaded yet');
    expect(jobStatusLabel(at('accepted'))).toBe('Accepted');
  });

  it('says which stop a longer job is on, and nothing extra for a simple one', () => {
    expect(stopProgress(at('en_route', drops, 1))).toBe('stop 2 of 3');
    expect(jobStatusLabel(at('en_route', drops, 1))).toBe('En route · stop 2 of 3');
    expect(stopProgress(at('en_route', simple, 1))).toBeUndefined();
    expect(stopProgress(at('delivered', drops, 3))).toBeUndefined();
  });

  it('knows the last stop', () => {
    expect(isLastStop(at('en_route', drops, 1))).toBe(false);
    expect(isLastStop(at('en_route', drops, 2))).toBe(true);
  });
});
