import type { JobDto, JobStatus } from '@wagonwise/contracts/jobs';

/** Plain words for the status line on the job screen — not shown as a button label. */
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Not yet assigned',
  assigned: 'Assigned to you',
  accepted: 'Accepted',
  at_pickup: 'At pickup',
  loaded: 'Loaded',
  en_route: 'En route',
  at_delivery: 'At delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

/** What the step logic reads of a job. `stops` is readonly so a read-only view of a job fits. */
export interface StepJob {
  readonly status: JobStatus;
  readonly stops: readonly JobDto['stops'][number][];
  readonly currentStop: number;
}

export function currentStopOf(
  job: Pick<StepJob, 'stops' | 'currentStop'>,
): JobDto['stops'][number] | undefined {
  return job.stops[job.currentStop];
}

/** Whether the stop the driver is on is the last one, so finishing it finishes the job. */
export function isLastStop(job: Pick<StepJob, 'stops' | 'currentStop'>): boolean {
  return job.currentStop >= job.stops.length - 1;
}

/**
 * The one step the driver can take next, for this job (core's `nextStatus` decides it for real; this is how it
 * reads on a button): arrive at the stop they are heading for, finish it (loaded, delivered), set off for the
 * next. A job that starts with a delivery has nothing to collect, so from accepted the next step is "Loaded and
 * ready". Finishing a delivery that is not the last one leaves the driver loaded, ready to set off again.
 */
export function nextStepFor(
  job: StepJob,
): { readonly to: JobStatus; readonly label: string } | undefined {
  const kind = currentStopOf(job)?.kind;
  switch (job.status) {
    case 'assigned':
      return { to: 'accepted', label: 'Accept job' };
    case 'accepted':
      return kind === 'delivery'
        ? { to: 'loaded', label: 'Loaded and ready' }
        : { to: 'at_pickup', label: 'Arrived at pickup' };
    case 'at_pickup':
      return { to: 'loaded', label: 'Loaded' };
    case 'loaded':
      return { to: 'en_route', label: 'Set off' };
    case 'en_route':
      return kind === 'delivery'
        ? { to: 'at_delivery', label: 'Arrived' }
        : { to: 'at_pickup', label: 'Arrived at pickup' };
    case 'at_delivery':
      return { to: isLastStop(job) ? 'delivered' : 'loaded', label: 'Delivered' };
    case 'draft':
    case 'delivered':
    case 'cancelled':
    case 'failed':
      return undefined;
  }
}

const IN_PROGRESS: readonly JobStatus[] = [
  'accepted',
  'at_pickup',
  'loaded',
  'en_route',
  'at_delivery',
];

/** "Stop 2 of 3", for a job with more than a collection and a delivery; nothing for a simple one. */
export function stopProgress(job: StepJob): string | undefined {
  if (job.stops.length <= 2 || !IN_PROGRESS.includes(job.status)) return undefined;
  return `stop ${Math.min(job.currentStop + 1, job.stops.length)} of ${job.stops.length}`;
}

/** The status in words for the job screen and cards. An accepted job that starts with a delivery says it is not
 *  loaded yet, since there is nothing to head for; a longer job says which stop it is on. */
export function jobStatusLabel(job: StepJob): string {
  const base =
    job.status === 'accepted' && currentStopOf(job)?.kind === 'delivery'
      ? 'Accepted, not loaded yet'
      : JOB_STATUS_LABELS[job.status];
  const progress = stopProgress(job);
  return progress === undefined ? base : `${base} · ${progress}`;
}

// A short, hard-coded word list rather than a server round trip (M5.3, design doc §5: "loaded and
// leaving") — same reasoning as yes-no-parser.ts's YES_WORDS/NO_WORDS. Only ever matched against
// the one status a job can currently move on from (`NEXT_STEP`'s own keys), never a choice among
// several, so the same word ("arrived") appearing under two different statuses here is never
// ambiguous in practice.
const SET_OFF_WORDS = ['set off', 'setting off', 'leaving', 'on my way', 'departing', 'left'];
// A job that starts with a delivery: from accepted the next step is loaded, so it is heard as loaded.
const NO_PICKUP_TRIGGER_WORDS: readonly string[] = ['loaded', 'load', 'ready', 'ready to go'];

/** The words that mean the step this job can take next, which depends on the status and on whether the stop
 *  the driver is on is a collection or a delivery. */
function triggerWords(job: StepJob): readonly string[] | undefined {
  const kind = currentStopOf(job)?.kind;
  switch (job.status) {
    case 'assigned':
      return ['accept'];
    case 'accepted':
      return kind === 'delivery' ? NO_PICKUP_TRIGGER_WORDS : ['arrived', 'pickup', 'picked up'];
    case 'at_pickup':
      return ['loaded', 'load'];
    case 'loaded':
      return SET_OFF_WORDS;
    case 'en_route':
      return kind === 'pickup' ? ['arrived', 'pickup', 'here'] : ['arrived', 'delivery', 'here'];
    case 'at_delivery':
      return ['delivered', 'dropped off', 'done', 'finished'];
    case 'draft':
    case 'delivered':
    case 'cancelled':
    case 'failed':
      return undefined;
  }
}

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary matching, not a plain substring check — same reasoning as yes-no-parser.ts's
// matchesAny.
function matchesAny(normalized: string, words: readonly string[]): boolean {
  return words.some((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`).test(normalized));
}

/** Whether a transcript sounds like the driver reporting the step this job can currently take. `false` for a
 *  job with no next step (finished, or not yet assigned): there is nothing to confirm either way. */
export function matchesJobStatusTrigger(transcript: string, job: StepJob): boolean {
  const words = triggerWords(job);
  if (words === undefined) return false;
  return matchesAny(transcript.toLowerCase(), words);
}
