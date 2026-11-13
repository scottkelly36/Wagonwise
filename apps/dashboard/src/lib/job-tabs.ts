import type { JobDto, JobStatus } from '@wagonwise/contracts/jobs';

/** The groups the Jobs page can narrow its list to. Every job is in exactly one group besides "all". */
export type JobTab =
  'all' | 'needs_driver' | 'not_accepted' | 'on_the_road' | 'delivered' | 'stopped';

const GROUPS: Record<Exclude<JobTab, 'all'>, readonly JobStatus[]> = {
  // Made, not yet given to a driver.
  needs_driver: ['draft'],
  // Given to a driver who has not yet said yes.
  not_accepted: ['assigned'],
  // The driver has taken it and it is not yet delivered (the same set the live map follows).
  on_the_road: ['accepted', 'at_pickup', 'loaded', 'en_route', 'at_delivery'],
  delivered: ['delivered'],
  stopped: ['cancelled', 'failed'],
};

export const JOB_TAB_LABELS: Record<JobTab, string> = {
  all: 'All',
  needs_driver: 'Needs a driver',
  not_accepted: 'Not accepted yet',
  on_the_road: 'On the road',
  delivered: 'Delivered',
  stopped: 'Cancelled or failed',
};

export const JOB_TABS: readonly JobTab[] = [
  'all',
  'needs_driver',
  'not_accepted',
  'on_the_road',
  'delivered',
  'stopped',
];

type WithStatus = Pick<JobDto, 'status'>;

/** The jobs in a group; "all" is everything. */
export function jobsInTab<T extends WithStatus>(jobs: readonly T[], tab: JobTab): T[] {
  if (tab === 'all') return [...jobs];
  const statuses = GROUPS[tab];
  return jobs.filter((job) => statuses.includes(job.status));
}

/** How many jobs are in each group, for the numbers on the tabs. */
export function jobTabCounts(jobs: readonly WithStatus[]): Record<JobTab, number> {
  const counts = { all: jobs.length } as Record<JobTab, number>;
  for (const tab of JOB_TABS) {
    if (tab !== 'all') counts[tab] = jobsInTab(jobs, tab).length;
  }
  return counts;
}

/** A tab's label with its count, e.g. "On the road (3)". */
export function jobTabLabel(tab: JobTab, counts: Record<JobTab, number>): string {
  return `${JOB_TAB_LABELS[tab]} (${counts[tab]})`;
}

/** What an empty tab says. */
export function emptyJobsText(tab: JobTab): string {
  switch (tab) {
    case 'all':
      return 'No jobs yet.';
    case 'needs_driver':
      return 'Every job has a driver.';
    case 'not_accepted':
      return 'No job is waiting for a driver to accept it.';
    case 'on_the_road':
      return 'No job is on the road.';
    case 'delivered':
      return 'Nothing has been delivered in this list.';
    case 'stopped':
      return 'No cancelled or failed jobs in this list.';
  }
}
