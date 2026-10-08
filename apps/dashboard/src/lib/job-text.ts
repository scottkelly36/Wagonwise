import type { JobDto } from '@wagonwise/contracts/jobs';

type TextJob = Pick<JobDto, 'status' | 'stops'> & { readonly currentStop?: number };

const IN_PROGRESS: readonly JobDto['status'][] = [
  'accepted',
  'at_pickup',
  'loaded',
  'en_route',
  'at_delivery',
];

/** Whether the job has a pickup stop. A job without one has nowhere to collect from, so the driver says when
 *  they are loaded. */
export function jobHasPickup(job: Pick<JobDto, 'stops'>): boolean {
  return job.stops.some((s) => s.kind === 'pickup');
}

/** A job's status as a person reads it: "at pickup", not "at_pickup". An accepted job that starts with a
 *  delivery says it is not loaded yet, since there is nothing to head for; a job with several stops says which
 *  one it is on. */
export function jobStatusText(job: TextJob): string {
  const stop = job.stops[job.currentStop ?? 0];
  let text: string;
  if (job.status === 'accepted' && stop?.kind === 'delivery') {
    text = 'Accepted, not loaded yet';
  } else {
    const words = job.status.replaceAll('_', ' ');
    text = words.charAt(0).toUpperCase() + words.slice(1);
  }
  if (job.stops.length > 2 && IN_PROGRESS.includes(job.status)) {
    const n = Math.min((job.currentStop ?? 0) + 1, job.stops.length);
    text += ` · stop ${n} of ${job.stops.length}`;
  }
  return text;
}
