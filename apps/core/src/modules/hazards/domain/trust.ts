import { isBlocking, type HazardReport } from './hazard-report.js';

/**
 * What the record says about one reporter's past reports (P2-M7.2, design doc §7). Counted from
 * their reports, never stored, so a score cannot drift from the decisions behind it.
 */
export interface ReporterRecord {
  /** Reports a moderator approved. */
  readonly approved: number;
  /** Reports a moderator rejected. */
  readonly rejected: number;
  /** Reports the community dismissed (a moderator rejection is counted above, not here). */
  readonly communityDismissed: number;
}

export const NO_RECORD: ReporterRecord = { approved: 0, rejected: 0, communityDismissed: 0 };

export type ReporterTrust = 'low' | 'neutral' | 'high';

/** A moderator's rejection is a person's judgement, so it weighs twice a community dismissal. */
const REJECTED_WEIGHT = 2;
const DISMISSED_WEIGHT = 1;

/** A score at or below this is `low`: two rejections, or one rejection plus one dismissal, or three
 *  dismissals. Guesses, like the expiry window; revisit with real pilot data. */
export const LOW_TRUST_AT_OR_BELOW = -3;
/** A score at or above this is `high`: three approved reports and nothing against them. */
export const HIGH_TRUST_AT_OR_ABOVE = 3;

export function trustScore(record: ReporterRecord): number {
  return (
    record.approved -
    record.rejected * REJECTED_WEIGHT -
    record.communityDismissed * DISMISSED_WEIGHT
  );
}

/**
 * A reporter with no history is `neutral` (owner's decision, 2026-10-03): only a bad record can ever
 * make a reporter `low`, so a new tester's reports are never held back for being new.
 */
export function reporterTrust(record: ReporterRecord): ReporterTrust {
  const score = trustScore(record);
  if (score <= LOW_TRUST_AT_OR_BELOW) return 'low';
  if (score >= HIGH_TRUST_AT_OR_ABOVE) return 'high';
  return 'neutral';
}

/**
 * The "hold doubtful reports" routing rule (design doc §7, owner chose "hybrid by severity"): a
 * blocking report is kept out of routing only when ALL of these hold: its reporter's trust is
 * `low`, it carries no measurement, nobody else has confirmed it, and no moderator has approved it.
 * Anything else still routes around it, as before.
 *
 * Deviation from the design doc: it also asks for "not on a major road". Nothing in core knows a
 * hazard's road class, so that condition is dropped (owner, 2026-10-03). The report still shows on
 * the map and in the moderation queue; only routing holds it back.
 *
 * This makes routing less cautious for the reports it catches, so it is deliberately narrow, and
 * official restrictions and curated overrides never pass through it.
 */
export function isHeldBackFromRouting(
  report: HazardReport,
  trust: ReporterTrust,
  approvedByModerator: boolean,
): boolean {
  return (
    isBlocking(report.type) &&
    trust === 'low' &&
    report.measurement === undefined &&
    report.confirmations === 0 &&
    !approvedByModerator
  );
}
