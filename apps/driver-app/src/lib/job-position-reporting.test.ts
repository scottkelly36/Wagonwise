import type { JobStatus } from '@wagonwise/contracts/jobs';

import { isTrackedStatus, POSITION_REPORT_INTERVAL_MS } from './job-position-reporting';

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
