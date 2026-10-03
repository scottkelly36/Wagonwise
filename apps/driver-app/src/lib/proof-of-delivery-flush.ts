import type { AttachProofOfDeliveryRequest } from '@wagonwise/contracts/jobs';

import { ApiError } from '../api/errors';

export interface QueuedProofOfDelivery extends AttachProofOfDeliveryRequest {
  readonly jobId: string;
}

export interface ProofFlushResult {
  /** Job ids whose photo reached the server. */
  readonly sent: readonly string[];
  /** Job ids whose photo the server will never accept — dropped from the queue. */
  readonly discarded: readonly string[];
  readonly remaining: readonly QueuedProofOfDelivery[];
}

/** A 4xx means this photo, for this job, is wrong and retrying can't fix it (job gone, not the
 *  driver's job, bad payload). 401 (token expiring), 408 and 429 are about the moment, not the
 *  photo, so they stay queued like a network failure. */
export function isPermanentRejection(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 401 || error.status === 408 || error.status === 429) return false;
  return error.status >= 400 && error.status < 500;
}

/**
 * Sends queued proof-of-delivery photos, one at a time. Pure orchestration (`submit` is injected),
 * like `flushQueuedReports` — but with one difference: that queue stops at any failure and so can
 * wedge forever on a report the server will never take. A photo is bigger and tied to a job that
 * can vanish (cancelled, reassigned), so a permanent rejection is dropped and the next one is
 * tried, while anything else (no signal, a 5xx) stops the pass and leaves the rest queued.
 */
export async function flushQueuedProofs(
  queued: readonly QueuedProofOfDelivery[],
  submit: (item: QueuedProofOfDelivery) => Promise<unknown>,
): Promise<ProofFlushResult> {
  const sent: string[] = [];
  const discarded: string[] = [];
  for (let index = 0; index < queued.length; index++) {
    const item = queued[index];
    if (item === undefined) continue;
    try {
      await submit(item);
      sent.push(item.jobId);
    } catch (error) {
      if (isPermanentRejection(error)) {
        discarded.push(item.jobId);
        continue;
      }
      return { sent, discarded, remaining: queued.slice(index) };
    }
  }
  return { sent, discarded, remaining: [] };
}
