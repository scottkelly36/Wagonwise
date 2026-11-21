import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { acceptableTime, FLOW_EVENT_RETENTION_DAYS, type FlowEvent } from '../domain/flow-event.js';

/** Where flow events are kept. */
export interface FlowEventRepository {
  insert(events: readonly FlowEvent[]): Promise<void>;
  /** Deletes events that happened before `cutoff`, and says how many. */
  deleteBefore(cutoff: Date): Promise<number>;
}

export interface FlowEventDeps {
  readonly repo: FlowEventRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** What the driver server forwards, already checked against the fixed lists in the contract. */
export interface RecordFlowEventsInput {
  readonly sessionId: string;
  readonly appVersion: string;
  readonly platform: 'ios' | 'android';
  readonly updateDate?: string | undefined;
  readonly events: readonly {
    readonly event: string;
    readonly choice?: string | undefined;
    readonly at: Date;
  }[];
}

/** Stores a batch from one session, leaving out any whose time is not believable (`acceptableTime`), and returns how many were kept.
 *  Who sent them is never asked for: the events are anonymous. */
export async function recordFlowEvents(
  deps: FlowEventDeps,
  input: RecordFlowEventsInput,
): Promise<number> {
  const now = deps.clock.now();
  const kept: FlowEvent[] = input.events
    .filter((e) => acceptableTime(e.at, now))
    .map((e) => ({
      id: deps.ids.newId(),
      sessionId: input.sessionId,
      event: e.event,
      choice: e.choice,
      appVersion: input.appVersion,
      platform: input.platform,
      updateDate: input.updateDate,
      at: e.at,
    }));
  if (kept.length > 0) await deps.repo.insert(kept);
  return kept.length;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deletes events older than the retention period; run on a timer by composition. */
export function pruneFlowEvents(deps: {
  /** Anything with a 90-day sweep: the flow events, and the website visits (the same retention). */
  readonly repo: Pick<FlowEventRepository, 'deleteBefore'>;
  readonly clock: Clock;
}): Promise<number> {
  return deps.repo.deleteBefore(
    new Date(deps.clock.now().getTime() - FLOW_EVENT_RETENTION_DAYS * DAY_MS),
  );
}
