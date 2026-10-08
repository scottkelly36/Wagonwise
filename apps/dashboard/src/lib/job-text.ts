import type { JobDto } from '@wagonwise/contracts/jobs';

/** Whether the job has a pickup stop. A job without one has nowhere to collect from, so the driver says when
 *  they are loaded (core: accepted goes straight to loaded). */
export function jobHasPickup(job: Pick<JobDto, 'stops'>): boolean {
  return job.stops.some((s) => s.kind === 'pickup');
}

/** A job's status as a person reads it: "at pickup", not "at_pickup". An accepted job with no pickup says it
 *  is not loaded yet, since there is no pickup to head for. */
export function jobStatusText(job: Pick<JobDto, 'status' | 'stops'>): string {
  if (job.status === 'accepted' && !jobHasPickup(job)) return 'Accepted, not loaded yet';
  const text = job.status.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
