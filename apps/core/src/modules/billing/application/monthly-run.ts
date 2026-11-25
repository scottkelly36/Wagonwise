import { placeholderFields } from '../domain/billing-details.js';
import { previousMonth, totalPence } from '../domain/invoice.js';
import type { MonthlyRunSummary } from '../domain/monthly-run-email.js';
import { ukDay } from '../domain/plan.js';
import { draftMonth, type InvoiceDeps } from './invoices.js';
import type { DraftRunRepository } from './ports/draft-run-repository.js';

export interface MonthlyRunDeps extends InvoiceDeps {
  readonly runs: DraftRunRepository;
}

export type MonthlyRunOutcome =
  | { readonly ran: false; readonly reason: 'too_early' | 'already_done' }
  | ({ readonly ran: true } & MonthlyRunSummary);

/**
 * From the 2nd of each month, drafts last month's invoices once (the 1st is left alone so a UK day's usage has settled). A month already
 * recorded in `draft_runs` is never drafted again, so a draft the owner deleted on purpose stays deleted. The drafts are for the owner to
 * check; nothing is issued or charged. Everything here is in WagonWise's data scope (the caller opens it).
 */
export async function runMonthlyDrafts(deps: MonthlyRunDeps): Promise<MonthlyRunOutcome> {
  const now = deps.clock.now();
  const today = ukDay(now);
  if (Number(today.slice(8, 10)) < 2) return { ran: false, reason: 'too_early' };
  const month = previousMonth(today.slice(0, 7));
  if (await deps.runs.has(month)) return { ran: false, reason: 'already_done' };

  const made = await draftMonth(deps, null, month);
  const drafts = made.created.map((i) => ({
    company: i.companyName,
    totalPence: totalPence(i.lines),
  }));
  const total = drafts.reduce((sum, d) => sum + d.totalPence, 0);
  await deps.runs.record({ month, ranAt: now, drafts: drafts.length, totalPence: total });
  const { details } = await deps.details.get();
  return {
    ran: true,
    month,
    drafts,
    totalPence: total,
    onTrial: made.skipped.filter((s) => s.reason === 'on_trial').length,
    detailsIncomplete: placeholderFields(details).length > 0,
  };
}
