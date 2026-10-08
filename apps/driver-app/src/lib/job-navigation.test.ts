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
const stops = [PICKUP, DELIVERY] as unknown as JobDto['stops'];

describe('navigationTarget', () => {
  it('is the pickup once accepted, until the load is on', () => {
    expect(navigationTarget({ status: 'accepted', stops })).toMatchObject({
      kind: 'pickup',
      stop: { name: 'Quarry' },
    });
  });

  it('is the delivery once loaded, and while en route', () => {
    for (const status of ['loaded', 'en_route'] as const) {
      expect(navigationTarget({ status, stops })).toMatchObject({
        kind: 'delivery',
        stop: { name: 'Depot' },
      });
    }
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
      expect(navigationTarget({ status, stops })).toBeUndefined();
    }
  });

  it('is nothing for a job without the stop it needs', () => {
    expect(
      navigationTarget({ status: 'en_route', stops: [PICKUP] as unknown as JobDto['stops'] }),
    ).toBeUndefined();
  });
});

describe('isTripToTarget', () => {
  const target = navigationTarget({ status: 'accepted', stops });

  it('recognises a trip that ends at the stop, allowing for the road being a little off', () => {
    expect(isTripToTarget({ lat: 54.9712, lon: -2.1 }, target!)).toBe(true);
  });

  it('does not treat a trip elsewhere as this one', () => {
    expect(isTripToTarget(DELIVERY.location, target!)).toBe(false);
  });
});

describe('jobActions', () => {
  it('offers Accept first', () => {
    expect(jobActions('assigned', false)).toEqual({
      primary: { kind: 'advance', to: 'accepted', label: 'Accept job' },
    });
  });

  it('offers Start once accepted, with the manual arrival as the second choice', () => {
    expect(jobActions('accepted', false)).toEqual({
      primary: { kind: 'navigate', label: 'Start' },
      secondary: { kind: 'advance', to: 'at_pickup', label: 'Arrived at pickup' },
    });
  });

  it('offers to continue, not start again, when the trip is already running', () => {
    expect(jobActions('accepted', true)?.primary).toEqual({
      kind: 'navigate',
      label: 'Continue navigation',
    });
    expect(jobActions('en_route', true)?.primary).toEqual({
      kind: 'navigate',
      label: 'Continue navigation',
    });
  });

  it('makes Set off both the step and the start of navigation to the delivery', () => {
    expect(jobActions('loaded', false)).toEqual({
      primary: { kind: 'navigate', label: 'Set off', advanceFirst: 'en_route' },
    });
  });

  it('lets a driver on the road start navigation if it was not started, or mark arrival by hand', () => {
    expect(jobActions('en_route', false)).toEqual({
      primary: { kind: 'navigate', label: 'Start navigation' },
      secondary: { kind: 'advance', to: 'at_delivery', label: 'Arrived' },
    });
  });

  it('keeps the plain steps at the stops', () => {
    expect(jobActions('at_pickup', false)?.primary).toEqual({
      kind: 'advance',
      to: 'loaded',
      label: 'Loaded',
    });
    expect(jobActions('at_delivery', false)?.primary).toEqual({
      kind: 'advance',
      to: 'delivered',
      label: 'Delivered',
    });
  });

  it('has nothing for a job that is not live', () => {
    for (const status of ['draft', 'delivered', 'cancelled', 'failed'] as const) {
      expect(jobActions(status, false)).toBeUndefined();
    }
  });
});

describe('arrivalStep', () => {
  it('is the arrival at whichever stop is being driven to', () => {
    expect(arrivalStep('accepted')).toEqual({ to: 'at_pickup', label: 'Arrived at pickup' });
    expect(arrivalStep('en_route')).toEqual({ to: 'at_delivery', label: 'Arrived' });
  });

  it('is nothing at any other step', () => {
    for (const status of ['assigned', 'at_pickup', 'loaded', 'at_delivery', 'delivered'] as const) {
      expect(arrivalStep(status)).toBeUndefined();
    }
  });
});

describe('jobSubtitle', () => {
  it('names the pickup until the load is on, and the delivery after', () => {
    expect(jobSubtitle({ status: 'assigned', stops })).toBe('Quarry');
    expect(jobSubtitle({ status: 'accepted', stops })).toBe('Quarry');
    expect(jobSubtitle({ status: 'loaded', stops })).toBe('Depot');
    expect(jobSubtitle({ status: 'en_route', stops })).toBe('Depot');
  });

  it('says "At" a stop once the driver is there', () => {
    expect(jobSubtitle({ status: 'at_pickup', stops })).toBe('At Quarry');
    expect(jobSubtitle({ status: 'at_delivery', stops })).toBe('At Depot');
  });

  it('is nothing for a job with no stops', () => {
    expect(jobSubtitle({ status: 'accepted', stops: [] })).toBeUndefined();
  });
});

describe('a job with no pickup', () => {
  const deliveryOnly = [DELIVERY] as unknown as JobDto['stops'];

  it('goes from accepted to "Loaded and ready", with no navigation yet', () => {
    expect(jobActions('accepted', false, false)).toEqual({
      primary: { kind: 'advance', to: 'loaded', label: 'Loaded and ready' },
    });
    // The rest of the flow is as for any job.
    expect(jobActions('loaded', false, false)?.primary).toMatchObject({ kind: 'navigate' });
  });

  it('has no arrival to confirm while accepted', () => {
    expect(arrivalStep('accepted', false)).toBeUndefined();
    expect(arrivalStep('en_route', false)).toEqual({ to: 'at_delivery', label: 'Arrived' });
  });

  it('has nowhere to navigate to until the load is on', () => {
    expect(navigationTarget({ status: 'accepted', stops: deliveryOnly })).toBeUndefined();
    expect(navigationTarget({ status: 'loaded', stops: deliveryOnly })?.kind).toBe('delivery');
  });

  it('names the delivery on its cards', () => {
    expect(jobSubtitle({ status: 'assigned', stops: deliveryOnly })).toBe('Depot');
    expect(jobSubtitle({ status: 'accepted', stops: deliveryOnly })).toBe('Depot');
  });
});
