/**
 * One step a driver reached in the app, or a fixed choice they made on it (docs/flow-tracking-plan.md). Anonymous: the session is a
 * random id made when the app opened, and nothing ties it to a driver.
 */
export interface FlowEvent {
  readonly id: string;
  readonly sessionId: string;
  readonly event: string;
  readonly choice?: string | undefined;
  readonly appVersion: string;
  readonly platform: 'ios' | 'android';
  readonly at: Date;
}

/** Kept no longer than this (the owner's decision, 2026-11-17). */
export const FLOW_EVENT_RETENTION_DAYS = 90;

/** The app drops events it could not send within a day; anything older than this, or more than a few minutes ahead of the server's
 *  clock (a phone set wrong), is not stored, so the times on the usage page can be trusted. */
export const OLDEST_ACCEPTED_MS = 24 * 60 * 60 * 1000;
export const NEWEST_ACCEPTED_MS = 5 * 60 * 1000;

/** Whether an event the phone says happened at `at` is believable now. */
export function acceptableTime(at: Date, now: Date): boolean {
  const t = at.getTime();
  return (
    Number.isFinite(t) &&
    t >= now.getTime() - OLDEST_ACCEPTED_MS &&
    t <= now.getTime() + NEWEST_ACCEPTED_MS
  );
}
