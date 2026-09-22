import { err, ok, type Result } from '../../../shared/result.js';
import { dismiss, type HazardReport, type HazardReportId } from '../domain/hazard-report.js';
import type { HazardReportNotFound } from './errors.js';
import type { HazardRepository } from './ports/hazard-repository.js';

export interface DismissHazardDeps {
  readonly repo: HazardRepository;
}

export interface DismissHazardInput {
  readonly id: HazardReportId;
}

export type DismissHazardError = HazardReportNotFound;

/** A driver reports a hazard isn't there — community moderation (design doc §3): enough
 *  dismissals relative to confirmations moves the report to `dismissed` (domain/hazard-report.ts's
 *  `dismiss()`). No `Clock` needed — unlike `confirm()`, `dismiss()` doesn't touch `expiresAt`. */
export async function dismissHazard(
  deps: DismissHazardDeps,
  input: DismissHazardInput,
): Promise<Result<HazardReport, DismissHazardError>> {
  const existing = await deps.repo.findById(input.id);
  if (!existing) {
    return err({ tag: 'HazardReportNotFound' });
  }
  const next = dismiss(existing);
  await deps.repo.save(next);
  return ok(next);
}
