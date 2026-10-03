import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { hazardModeratedEvent } from '../domain/events.js';
import type { HazardReport, HazardReportId, InvalidMeasurement } from '../domain/hazard-report.js';
import {
  applyModeration,
  moderatedFields,
  queueReasons,
  type ModerationAction,
  type ModerationDecision,
  type QueueReason,
} from '../domain/moderation.js';
import { makeId } from '../../../shared/brand.js';
import { requireHazardAdmin, type Forbidden } from './authorization.js';
import type { HazardReportNotFound } from './errors.js';
import type { AdminDirectory, StaffId } from './ports/admin-directory.js';
import type { HazardRepository } from './ports/hazard-repository.js';

export interface QueuedHazard {
  readonly report: HazardReport;
  readonly reasons: readonly QueueReason[];
}

export interface ListModerationQueueDeps {
  readonly repo: Pick<HazardRepository, 'findAwaitingReview'>;
  readonly admins: AdminDirectory;
}

/**
 * The moderation queue (design doc §7): active reports that are blocking-type and not yet approved,
 * or that drivers are disagreeing about. Oldest first, so nothing waits behind newer reports.
 * WagonWise admins only, to begin with (the design doc: "in the early months, you are the
 * moderator"). Anyone else gets `Forbidden`, never a partial list.
 */
export async function listModerationQueue(
  deps: ListModerationQueueDeps,
  input: { readonly callerId: StaffId },
): Promise<Result<QueuedHazard[], Forbidden>> {
  const allowed = await requireHazardAdmin(deps.admins, input.callerId);
  if (!allowed.ok) return allowed;
  const candidates = await deps.repo.findAwaitingReview();
  const queue = candidates
    // The repository already excluded approved reports, so `approved` is false for all of them.
    .map((report) => ({ report, reasons: queueReasons(report, false) }))
    .filter((entry) => entry.reasons.length > 0)
    .sort((a, b) => a.report.createdAt.getTime() - b.report.createdAt.getTime());
  return ok(queue);
}

export interface ModerateHazardDeps {
  readonly repo: Pick<HazardRepository, 'findById' | 'saveModerated'>;
  readonly admins: AdminDirectory;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export type ModerateHazardError = Forbidden | HazardReportNotFound | InvalidMeasurement;

/**
 * A moderator's decision about one report: applies it, records who decided what and what it
 * changed, and raises `HazardModerated`, all in one transaction. The admin check is first, before
 * the report is looked up, so a non-admin learns nothing about whether an id exists.
 *
 * Moderation can reject a community report or correct it, but it never touches official
 * restrictions (those aren't hazard reports) and it is a person's call on the record, not a score.
 */
export async function moderateHazard(
  deps: ModerateHazardDeps,
  input: {
    readonly callerId: StaffId;
    readonly id: HazardReportId;
    readonly action: ModerationAction;
    readonly note?: string | undefined;
  },
): Promise<Result<ModerationDecision, ModerateHazardError>> {
  const allowed = await requireHazardAdmin(deps.admins, input.callerId);
  if (!allowed.ok) return allowed;

  const report = await deps.repo.findById(input.id);
  if (report === null) return err({ tag: 'HazardReportNotFound' });

  const now = deps.clock.now();
  const changed = applyModeration(report, input.action, now);
  if (!changed.ok) return changed;

  const decision: ModerationDecision = {
    id: makeId<'ModerationDecisionId'>(deps.ids.newId()),
    hazardId: report.id,
    moderatorId: input.callerId,
    action: input.action.kind,
    note: input.note,
    before: moderatedFields(report),
    after: moderatedFields(changed.value),
    decidedAt: now,
  };
  await deps.repo.saveModerated(changed.value, decision, [
    hazardModeratedEvent(deps.ids.newId(), changed.value, decision),
  ]);
  return ok(decision);
}

export interface ListModerationDecisionsDeps {
  readonly repo: Pick<HazardRepository, 'findDecisions'>;
  readonly admins: AdminDirectory;
}

/** The audit trail for one report. Admins only. */
export async function listModerationDecisions(
  deps: ListModerationDecisionsDeps,
  input: { readonly callerId: StaffId; readonly id: HazardReportId },
): Promise<Result<ModerationDecision[], Forbidden>> {
  const allowed = await requireHazardAdmin(deps.admins, input.callerId);
  if (!allowed.ok) return allowed;
  return ok(await deps.repo.findDecisions(input.id));
}
