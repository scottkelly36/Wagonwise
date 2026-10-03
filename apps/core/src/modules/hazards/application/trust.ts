import type { HazardReport } from '../domain/hazard-report.js';
import {
  NO_RECORD,
  isHeldBackFromRouting,
  reporterTrust,
  type ReporterTrust,
} from '../domain/trust.js';
import type { HazardRepository } from './ports/hazard-repository.js';

export interface TrustAssessment {
  readonly trust: ReporterTrust;
  readonly heldBackFromRouting: boolean;
}

/**
 * Reporter trust and the routing hold for a set of reports (P2-M7.2). Only reads what it needs: a
 * reporter's record is looked up only for reports that could be held back (blocking, unmeasured,
 * unconfirmed), and approvals only for those whose reporter turned out to be low-trust.
 *
 * `forDisplay` also fetches trust for every report so the moderation queue can show it.
 */
export async function assessReports(
  repo: Pick<HazardRepository, 'findReporterRecords' | 'findApprovedIds'>,
  reports: readonly HazardReport[],
  options: { readonly forDisplay: boolean },
): Promise<ReadonlyMap<string, TrustAssessment>> {
  const couldBeHeld = (r: HazardReport): boolean =>
    r.measurement === undefined && r.confirmations === 0;
  const lookedUp = options.forDisplay ? reports : reports.filter(couldBeHeld);
  const records = await repo.findReporterRecords([...new Set(lookedUp.map((r) => r.reporterId))]);
  const trustOf = (r: HazardReport): ReporterTrust =>
    reporterTrust(records.get(r.reporterId) ?? NO_RECORD);

  const candidates = reports.filter((r) => couldBeHeld(r) && trustOf(r) === 'low');
  const approved = await repo.findApprovedIds(candidates.map((r) => r.id));

  const out = new Map<string, TrustAssessment>();
  for (const r of options.forDisplay ? reports : lookedUp) {
    const trust = trustOf(r);
    out.set(r.id, {
      trust,
      heldBackFromRouting: isHeldBackFromRouting(r, trust, approved.has(r.id)),
    });
  }
  return out;
}
