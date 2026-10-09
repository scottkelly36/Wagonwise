import { err, ok, type Result } from '../../../shared/result.js';
import type { CompanyId } from '../domain/fuel.js';
import { isMonth } from '../domain/inputs.js';
import { buildCostReport, ukMonthRange } from '../domain/job-costs.js';
import { actualFrom, buildOutlook, monthsEndingAt, type Outlook } from '../domain/outlook.js';
import { canManageCosts, type Forbidden } from './inputs.js';
import type { InvalidMonth, JobCostReportDeps } from './job-cost-report.js';
import type { StaffCaller } from './ports.js';

/** How many months of actuals the outlook shows, ending with the current one. */
export const HISTORY_MONTHS = 6;

/**
 * The last six months of actuals (the current month, still going, last) and a three-month look ahead built from them
 * (`domain/outlook.ts` says how). `month` is the current month. It reads wages, so it needs `manage_billing` like the job
 * costs it is built from. Each month is worked out the same way as on the Job profit page, from one read of the jobs, fuel,
 * costs and rates for the whole stretch.
 */
export async function outlook(
  deps: JobCostReportDeps,
  caller: StaffCaller,
  companyId: CompanyId,
  month: string,
): Promise<Result<Outlook, Forbidden | InvalidMonth>> {
  if (!canManageCosts(caller, companyId)) return err({ tag: 'Forbidden' });
  if (!isMonth(month)) return err({ tag: 'InvalidMonth' });
  const months = monthsEndingAt(month, HISTORY_MONTHS);
  const from = ukMonthRange(months[0] as string).from;
  const to = ukMonthRange(month).to;
  const [jobs, fuel, runningCosts, rates, vehicles, drivers] = await Promise.all([
    deps.jobs.deliveredBetween(companyId, from, to),
    deps.fuel.listBetween(companyId, from, to),
    deps.runningCosts.listForCompany(companyId),
    deps.rates.listForCompany(companyId),
    deps.vehicles.listForCompany(companyId),
    deps.drivers.listForCompany(companyId),
  ]);
  const vehicleNames = new Map(vehicles.map((v) => [v.id, v.name]));
  const driverNames = new Map(drivers.map((d) => [d.id, d.name]));
  const history = months.map((m) => {
    const range = ukMonthRange(m);
    const report = buildCostReport({
      month: m,
      jobs: jobs.filter((j) => j.deliveredAt >= range.from && j.deliveredAt < range.to),
      fuel: fuel.filter((t) => t.occurredAt >= range.from && t.occurredAt < range.to),
      runningCosts,
      rates,
      vehicleNames,
      driverNames,
    });
    return actualFrom(report, m === month);
  });
  return ok(buildOutlook({ history, runningCosts, currentMonth: month }));
}
