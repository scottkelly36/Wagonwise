import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { hazardConfirmedEvent } from '../domain/events.js';
import { confirm, type HazardReport, type HazardReportId } from '../domain/hazard-report.js';
import type { HazardReportNotFound } from './errors.js';
import type { HazardRepository } from './ports/hazard-repository.js';

export interface ConfirmHazardDeps {
  readonly repo: HazardRepository;
  readonly clock: Clock;
  /** Only for the outbox event's own id (M6.3) — see `ReportHazardDeps`'s identical comment. */
  readonly ids: IdGenerator;
}

export interface ConfirmHazardInput {
  readonly id: HazardReportId;
}

export type ConfirmHazardError = HazardReportNotFound;

/** A driver passing a hazard confirms it's still there (design doc §5's "Still there?" prompt) —
 *  also reactivates it if it had expired (domain/hazard-report.ts's `confirm()`). */
export async function confirmHazard(
  deps: ConfirmHazardDeps,
  input: ConfirmHazardInput,
): Promise<Result<HazardReport, ConfirmHazardError>> {
  const existing = await deps.repo.findById(input.id);
  if (!existing) {
    return err({ tag: 'HazardReportNotFound' });
  }
  const next = confirm(existing, deps.clock.now());
  await deps.repo.save(next, [hazardConfirmedEvent(deps.ids.newId(), next)]);
  return ok(next);
}
