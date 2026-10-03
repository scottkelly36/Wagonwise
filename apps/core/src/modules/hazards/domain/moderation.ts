import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result } from '../../../shared/result.js';
import {
  expiryFor,
  isBlocking,
  validateMeasurement,
  DEFAULT_EXPIRY_DAYS,
  type HazardReport,
  type HazardReportId,
  type HazardStatus,
  type HazardType,
  type InvalidMeasurement,
  type Measurement,
} from './hazard-report.js';

/** A staff account's id; same brand name as `companies`' own (decision 46). */
export type StaffId = Id<'StaffId'>;
export type ModerationDecisionId = Id<'ModerationDecisionId'>;

/** What a WagonWise moderator can do to a report (design doc §7). Merging duplicates is not here:
 *  the automatic merge policy already folds near-identical reports together, and a manual merge
 *  needs its own rules about which counts survive — left until there is a real duplicate to learn
 *  from. */
export type ModerationAction =
  | { readonly kind: 'approve' }
  | { readonly kind: 'reject' }
  | {
      readonly kind: 'edit';
      readonly type?: HazardType | undefined;
      /** `null` removes the measurement; `undefined` leaves it alone. */
      readonly measurement?: Measurement | null | undefined;
    }
  | { readonly kind: 'set_lifetime'; readonly lifetime: 'permanent' | 'temporary' };

/** The fields moderation can change, snapshotted before and after a decision. */
export interface ModeratedFields {
  readonly type: HazardType;
  readonly measurement?: Measurement | undefined;
  readonly status: HazardStatus;
  readonly expiresAt?: Date | undefined;
}

export interface ModerationDecision {
  readonly id: ModerationDecisionId;
  readonly hazardId: HazardReportId;
  readonly moderatorId: StaffId;
  readonly action: ModerationAction['kind'];
  readonly note?: string | undefined;
  readonly before: ModeratedFields;
  readonly after: ModeratedFields;
  readonly decidedAt: Date;
}

export function moderatedFields(report: HazardReport): ModeratedFields {
  return {
    type: report.type,
    measurement: report.measurement,
    status: report.status,
    expiresAt: report.expiresAt,
  };
}

/**
 * The report as it stands after a moderator's action. Pure; the use case adds who, when, and the
 * audit record.
 *
 * - **approve** changes nothing on the report itself: the decision *is* the approval (the queue
 *   drops a report once it has one, and trust scoring will count it).
 * - **reject** takes the report out of use by marking it `dismissed`, the same status community
 *   dismissal reaches, so everything that already ignores dismissed reports (map, routing,
 *   avoidance) ignores it too. A moderator rejecting a report can therefore only ever remove caution
 *   they judged to be false, and that is a human decision on the record, not a score.
 * - **edit** changes the type and/or measurement. A new type gets that type's default expiry from now
 *   (a permanent type loses it, a temporary one gains it). A moderator correcting "low bridge 4.0 m"
 *   to "3.5 m" makes routing *more* cautious for taller vehicles; the reverse is theirs to judge.
 * - **set_lifetime** makes the report permanent (no expiry) or temporary (the default window from now).
 */
export function applyModeration(
  report: HazardReport,
  action: ModerationAction,
  now: Date,
): Result<HazardReport, InvalidMeasurement> {
  switch (action.kind) {
    case 'approve':
      return ok(report);
    case 'reject':
      return ok({ ...report, status: 'dismissed' });
    case 'edit': {
      if (action.measurement !== undefined && action.measurement !== null) {
        const valid = validateMeasurement(action.measurement);
        if (!valid.ok) return err(valid.error);
      }
      const type = action.type ?? report.type;
      const measurement =
        action.measurement === undefined ? report.measurement : (action.measurement ?? undefined);
      const retyped = type !== report.type;
      return ok({
        ...report,
        type,
        measurement,
        expiresAt: retyped ? expiryFor(type, now) : report.expiresAt,
      });
    }
    case 'set_lifetime':
      return ok({
        ...report,
        expiresAt:
          action.lifetime === 'permanent'
            ? undefined
            : new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
      });
  }
}

export type QueueReason = 'blocking_unreviewed' | 'disputed';

/** A report is "disputed" once drivers both confirm and dismiss it: neither the crowd nor the
 *  routing can tell which side is right, so a person should look. At least one of each is enough
 *  while there are only a few dozen drivers; raise it if the queue fills with noise. */
export const DISPUTED_MIN_EACH = 1;

/** Why (if at all) an active report needs a moderator's eyes (design doc §7: new blocking-type
 *  reports, and disputed ones). Anything already approved stays out; rejected reports are no longer
 *  active, so they drop out by status. */
export function queueReasons(report: HazardReport, approved: boolean): QueueReason[] {
  if (report.status !== 'active' || approved) return [];
  const reasons: QueueReason[] = [];
  if (isBlocking(report.type)) reasons.push('blocking_unreviewed');
  if (report.confirmations >= DISPUTED_MIN_EACH && report.dismissals >= DISPUTED_MIN_EACH) {
    reasons.push('disputed');
  }
  return reasons;
}
