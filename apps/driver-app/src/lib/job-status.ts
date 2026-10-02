import type { JobStatus } from '@wagonwise/contracts/jobs';

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

/** One big button per step (design doc §5): "Arrived at pickup" → "Loaded" → "Set off" →
 *  "Arrived" → "Delivered". `assigned` isn't itself in that list; "Accept job" is the natural
 *  step before it starts. Presentation only — core's `advanceStatus` is what actually validates a
 *  transition, so a status missing here just means there's nothing for the driver to tap yet. */
export const NEXT_STEP: Partial<
  Record<JobStatus, { readonly to: JobStatus; readonly label: string }>
> = {
  assigned: { to: 'accepted', label: 'Accept job' },
  accepted: { to: 'at_pickup', label: 'Arrived at pickup' },
  at_pickup: { to: 'loaded', label: 'Loaded' },
  loaded: { to: 'en_route', label: 'Set off' },
  en_route: { to: 'at_delivery', label: 'Arrived' },
  at_delivery: { to: 'delivered', label: 'Delivered' },
};

// A short, hard-coded word list rather than a server round trip (M5.3, design doc §5: "loaded and
// leaving") — same reasoning as yes-no-parser.ts's YES_WORDS/NO_WORDS. Only ever matched against
// the one status a job can currently move on from (`NEXT_STEP`'s own keys), never a choice among
// several, so the same word ("arrived") appearing under two different statuses here is never
// ambiguous in practice.
const STEP_TRIGGER_WORDS: Partial<Record<JobStatus, readonly string[]>> = {
  assigned: ['accept'],
  accepted: ['arrived', 'pickup', 'picked up'],
  at_pickup: ['loaded', 'load'],
  loaded: ['set off', 'setting off', 'leaving', 'on my way', 'departing', 'left'],
  en_route: ['arrived', 'delivery', 'here'],
  at_delivery: ['delivered', 'dropped off', 'done', 'finished'],
};

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary matching, not a plain substring check — same reasoning as yes-no-parser.ts's
// matchesAny.
function matchesAny(normalized: string, words: readonly string[]): boolean {
  return words.some((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`).test(normalized));
}

/** Whether a transcript sounds like the driver reporting the step a job at `status` can currently
 *  move to. `false` for a status with no next step (already finished, or not yet assigned) — there
 *  is nothing to confirm either way. */
export function matchesJobStatusTrigger(transcript: string, status: JobStatus): boolean {
  const words = STEP_TRIGGER_WORDS[status];
  if (words === undefined) return false;
  return matchesAny(transcript.toLowerCase(), words);
}
