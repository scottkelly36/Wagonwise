import type { JobStatus } from '@wagonwise/contracts/jobs';
import { describe, expect, it } from 'vitest';
import { JOB_TABS, jobsInTab, jobTabCounts, jobTabLabel } from './job-tabs';

const ALL_STATUSES: JobStatus[] = [
  'draft',
  'assigned',
  'accepted',
  'at_pickup',
  'loaded',
  'en_route',
  'at_delivery',
  'delivered',
  'cancelled',
  'failed',
];
const job = (status: JobStatus) => ({ status });

describe('job tabs', () => {
  it('puts every status in exactly one group', () => {
    const groups = JOB_TABS.filter((tab) => tab !== 'all');
    for (const status of ALL_STATUSES) {
      const inGroups = groups.filter((tab) => jobsInTab([job(status)], tab).length === 1);
      expect(inGroups, status).toHaveLength(1);
    }
  });

  it('counts each group, and the total', () => {
    const jobs = [
      'draft',
      'draft',
      'assigned',
      'accepted',
      'en_route',
      'delivered',
      'delivered',
      'delivered',
      'cancelled',
      'failed',
    ].map((s) => job(s as JobStatus));
    expect(jobTabCounts(jobs)).toEqual({
      all: 10,
      needs_driver: 2,
      not_accepted: 1,
      on_the_road: 2,
      delivered: 3,
      stopped: 2,
    });
  });

  it('keeps the jobs of the chosen group, in their order, and everything for all', () => {
    const jobs = [
      { id: 'a', status: 'delivered' as const },
      { id: 'b', status: 'draft' as const },
      { id: 'c', status: 'delivered' as const },
    ];
    expect(jobsInTab(jobs, 'delivered').map((j) => j.id)).toEqual(['a', 'c']);
    expect(jobsInTab(jobs, 'all').map((j) => j.id)).toEqual(['a', 'b', 'c']);
  });

  it('writes a label with its count', () => {
    const counts = jobTabCounts([job('en_route'), job('loaded')]);
    expect(jobTabLabel('on_the_road', counts)).toBe('On the road (2)');
    expect(jobTabLabel('delivered', counts)).toBe('Delivered (0)');
  });
});
