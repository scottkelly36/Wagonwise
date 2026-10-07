import type { JobStatus } from '@wagonwise/contracts/jobs';

import {
  isSharingPosition,
  isTrackedStatus,
  POSITION_REPORT_INTERVAL_MS,
} from './job-position-reporting';

describe('isTrackedStatus', () => {
  it.each(['accepted', 'at_pickup', 'loaded', 'en_route', 'at_delivery'] as JobStatus[])(
    'reports while %s',
    (status) => {
      expect(isTrackedStatus(status)).toBe(true);
    },
  );

  it.each(['draft', 'assigned', 'delivered', 'cancelled', 'failed'] as JobStatus[])(
    'does not report while %s',
    (status) => {
      expect(isTrackedStatus(status)).toBe(false);
    },
  );
});

describe('POSITION_REPORT_INTERVAL_MS', () => {
  it('stays within the design doc’s 30–60 second range', () => {
    expect(POSITION_REPORT_INTERVAL_MS).toBeGreaterThanOrEqual(30_000);
    expect(POSITION_REPORT_INTERVAL_MS).toBeLessThanOrEqual(60_000);
  });
});

describe('isSharingPosition', () => {
  it('shares only once the driver is navigating a job in a tracked state', () => {
    expect(isSharingPosition('accepted', true)).toBe(true);
    expect(isSharingPosition('en_route', true)).toBe(true);
  });

  it('does not share just because a job was accepted: the driver has not set off yet', () => {
    expect(isSharingPosition('accepted', false)).toBe(false);
    expect(isSharingPosition('loaded', false)).toBe(false);
  });

  it('never shares for a job that is not being driven, even with a trip running', () => {
    expect(isSharingPosition('assigned', true)).toBe(false);
    expect(isSharingPosition('delivered', true)).toBe(false);
  });
});
