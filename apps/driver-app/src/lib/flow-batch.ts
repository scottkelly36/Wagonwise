import { MAX_FLOW_EVENTS_PER_REQUEST } from '@wagonwise/contracts/usage';

import type { QueuedFlowEvent } from '../db/flow-event-queue';

/** The server keeps nothing older than a day, so the phone does not send it either. */
export const FLOW_EVENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** What to send now and what to throw away: anything over a day old (or with no readable time) is dropped, and the oldest of the rest
 *  go, up to the server's limit for one request. */
export function planFlowBatch(
  queued: readonly QueuedFlowEvent[],
  now: Date,
): { readonly send: QueuedFlowEvent[]; readonly drop: number[] } {
  const drop: number[] = [];
  const fresh: QueuedFlowEvent[] = [];
  for (const item of queued) {
    const t = new Date(item.at).getTime();
    if (!Number.isFinite(t) || now.getTime() - t > FLOW_EVENT_MAX_AGE_MS) drop.push(item.id);
    else fresh.push(item);
  }
  return { send: fresh.slice(0, MAX_FLOW_EVENTS_PER_REQUEST), drop };
}
