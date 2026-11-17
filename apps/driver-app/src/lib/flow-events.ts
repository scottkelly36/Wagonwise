import { flowEventSchema, type FlowEventName } from '@wagonwise/contracts/usage';
import * as Crypto from 'expo-crypto';

import { enqueueFlowEvent } from '../db/flow-event-queue';
import { useFlowEventsStore } from '../state/flow-events-store';

/** A random id for this sitting: made when the app process starts, never saved, never tied to the driver (docs/flow-tracking-plan.md). */
export const FLOW_SESSION_ID: string = Crypto.randomUUID();

/**
 * Notes that the driver reached a step, or made one of its fixed choices. Fire and forget: never blocks a screen, never throws.
 * Nothing is noted while the driver has turned it off, and anything off the contract's fixed lists is dropped here, so a place, a
 * postcode or search text can never be queued.
 */
export function trackFlow(event: FlowEventName, choice?: string): void {
  if (useFlowEventsStore.getState().status === 'off') return;
  const item = {
    event,
    ...(choice === undefined ? {} : { choice }),
    at: new Date().toISOString(),
  };
  if (!flowEventSchema.safeParse(item).success) return;
  void enqueueFlowEvent(item).catch(() => undefined);
}

let planKind: 'personal' | 'job' = 'personal';

/** Which screen planned the route now on the overview, so starting it can say whether it was for a company job. */
export function notePlanKind(kind: 'personal' | 'job'): void {
  planKind = kind;
}

export function currentPlanKind(): 'personal' | 'job' {
  return planKind;
}

/** A route option's kind, from its labels, as the fixed list names it. */
export function routeOptionChoice(labels: readonly string[]): string {
  if (labels.includes('fastest')) return 'fastest';
  if (labels.includes('toll-free')) return 'toll_free';
  if (labels.includes('gentle')) return 'fewer_hills';
  if (labels.includes('cheapest')) return 'cheapest';
  if (labels.includes('shortest')) return 'shortest';
  return 'other';
}
