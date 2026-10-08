import type { JobDto } from '@wagonwise/contracts/jobs';

import {
  arrivalStep,
  isTripToTarget,
  jobActions,
  jobSubtitle,
  navigationTarget,
} from './job-navigation';

const PICKUP = { kind: 'pickup', name: 'Quarry', location: { lat: 54.97, lon: -2.1 } } as const;
const DELIVERY = { kind: 'delivery', name: 'Depot', location: { lat: 54.96, lon: -1.5 } } as const;
const SECOND = { kind: 'delivery', name: 'Mart', location: { lat: 55.0, lon: -1.6 } } as const;
type Stops = JobDto['stops'];
const stops = [PICKUP, DELIVERY] as unknown as Stops;
const drops = [PICKUP, DELIVERY, SECOND] as unknown as Stops;
const deliveryOnly = [DELIVERY] as unknown as Stops;

/** A job at a status, on a given stop. A one-pickup one-delivery job is on stop 0 until loaded, then stop 1. */
const at = (status: JobDto['status'], jobStops: Stops = stops, currentStop = 0) => ({
  status,
  stops: jobStops,
  currentStop,
});

describe('navigationTarget', () => {
  it('is the pickup once accepted, until the load is on', () => {
    expect(navigationTarget(at('accepted'))).toMatchObject({
      kind: 'pickup',
      stop: { name: 'Quarry' },
    });
  });

  it('is the stop being driven to once loaded, and while en route', () => {
    for (const status of ['loaded', 'en_route'] as const) {
      expect(navigationTarget(at(status, stops, 1))).toMatchObject({
        kind: 'delivery',
        stop: { name: 'Depot' },
      });
    }
  });

  it('follows the stop through a longer job', () => {
    expect(navigationTarget(at('en_route', drops, 1))?.stop.name).toBe('Depot');
    expect(navigationTarget(at('loaded', drops, 2))?.stop.name).toBe('Mart');
  });

  it('is nothing before acceptance, at a stop, or once the job is over', () => {
    for (const status of [
      'draft',
      'assigned',
      'at_pickup',
      'at_delivery',
      'delivered',
      'cancelled',
      'failed',
    ] as const) {
      expect(navigationTarget(at(status, stops, 1))).toBeUndefined();
    }
  });

  it('is nothing when there is no stop left, and nothing for an accepted job that starts with a delivery', () => {
    expect(navigationTarget(at('en_route', stops, 2))).toBeUndefined();
    expect(navigationTarget(at('accepted', deliveryOnly))).toBeUndefined();
    expect(navigationTarget(at('loaded', deliveryOnly))?.kind).toBe('delivery');
  });
});

describe('isTripToTarget', () => {
  const target = navigationTarget(at('accepted'));

  it('recognises a trip that ends at the stop, allowing for the road being a little off', () => {
    expect(isTripToTarget({ lat: 54.9712, lon: -2.1 }, target!)).toBe(true);
  });

  it('does not treat a trip elsewhere as this one', () => {
    expect(isTripToTarget({ lat: 54.96, lon: -1.5 }, target!)).toBe(false);
  });
});

describe('jobActions', () => {
  it('accepts first', () => {
    expect(jobActions(at('assigned'), false)).toEqual({
      primary: { kind: 'advance', to: 'accepted', label: 'Accept job' },
    });
  });

  it('starts navigation once accepted, with the manual arrival beside it', () => {
    const actions = jobActions(at('accepted'), false);
    expect(actions?.primary).toEqual({ kind: 'navigate', label: 'Start' });
    expect(actions?.secondary).toEqual({
      kind: 'advance',
      to: 'at_pickup',
      label: 'Arrived at pickup',
    });
    expect(jobActions(at('accepted'), true)?.primary).toMatchObject({
      label: 'Continue navigation',
    });
  });

  it('goes straight to "Loaded and ready" when the job starts with a delivery', () => {
    expect(jobActions(at('accepted', deliveryOnly), false)).toEqual({
      primary: { kind: 'advance', to: 'loaded', label: 'Loaded and ready' },
    });
  });

  it('is loaded, then set off, which moves to en route and navigates', () => {
    expect(jobActions(at('at_pickup'), false)?.primary).toEqual({
      kind: 'advance',
      to: 'loaded',
      label: 'Loaded',
    });
    expect(jobActions(at('loaded', stops, 1), false)?.primary).toEqual({
      kind: 'navigate',
      label: 'Set off',
      advanceFirst: 'en_route',
    });
  });

  it('en route arrives at a delivery, or at the next collection', () => {
    expect(jobActions(at('en_route', stops, 1), false)?.secondary).toEqual({
      kind: 'advance',
      to: 'at_delivery',
      label: 'Arrived',
    });
    const twoCollections = [PICKUP, PICKUP, DELIVERY] as unknown as Stops;
    expect(jobActions(at('en_route', twoCollections, 1), false)?.secondary).toEqual({
      kind: 'advance',
      to: 'at_pickup',
      label: 'Arrived at pickup',
    });
  });

  it('delivering the last stop delivers the job; an earlier one leaves the driver loaded for the next', () => {
    expect(jobActions(at('at_delivery', stops, 1), false)?.primary).toEqual({
      kind: 'advance',
      to: 'delivered',
      label: 'Delivered',
    });
    expect(jobActions(at('at_delivery', drops, 1), false)?.primary).toEqual({
      kind: 'advance',
      to: 'loaded',
      label: 'Delivered',
    });
  });

  it('has nothing to offer once the job is over', () => {
    expect(jobActions(at('delivered', stops, 2), false)).toBeUndefined();
    expect(jobActions(at('cancelled'), false)).toBeUndefined();
  });
});

describe('arrivalStep', () => {
  it('is the arrival at whichever stop is being driven to', () => {
    expect(arrivalStep(at('accepted'))).toEqual({ to: 'at_pickup', label: 'Arrived at pickup' });
    expect(arrivalStep(at('en_route', stops, 1))).toEqual({ to: 'at_delivery', label: 'Arrived' });
  });

  it('is nothing at any other step, or with nowhere to arrive at yet', () => {
    for (const status of ['assigned', 'at_pickup', 'loaded', 'at_delivery', 'delivered'] as const) {
      expect(arrivalStep(at(status, stops, 1))).toBeUndefined();
    }
    expect(arrivalStep(at('accepted', deliveryOnly))).toBeUndefined();
  });
});

describe('jobSubtitle', () => {
  it('names the stop being driven to, and "At" a stop once there', () => {
    expect(jobSubtitle(at('assigned'))).toBe('Quarry');
    expect(jobSubtitle(at('accepted'))).toBe('Quarry');
    expect(jobSubtitle(at('loaded', stops, 1))).toBe('Depot');
    expect(jobSubtitle(at('en_route', stops, 1))).toBe('Depot');
    expect(jobSubtitle(at('at_pickup'))).toBe('At Quarry');
    expect(jobSubtitle(at('at_delivery', stops, 1))).toBe('At Depot');
  });

  it('says which stop a longer job is on', () => {
    expect(jobSubtitle(at('en_route', drops, 2))).toBe('Mart · 3 of 3');
    expect(jobSubtitle(at('assigned', drops))).toBe('Quarry · 1 of 3');
  });

  it('is nothing for a job with no stops, or once it is over', () => {
    expect(jobSubtitle(at('accepted', [] as unknown as Stops))).toBeUndefined();
    expect(jobSubtitle(at('delivered', stops, 2))).toBeUndefined();
  });
});
