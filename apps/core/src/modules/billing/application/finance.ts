import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { StaffId } from '../domain/billing-details.js';
import {
  costsTotal,
  activeCosts,
  monthFigures,
  monthsEndingAt,
  planChange,
  planStop,
  projection,
  revenueByCompany,
  validateCostFields,
  type Cost,
  type CostId,
  type CompanyRevenue,
  type InvalidCost,
  type InvalidCostChange,
  type MonthFigures,
  type Projection,
} from '../domain/finance.js';
import { validateMonth, type InvalidMonth, type MonthString } from '../domain/invoice.js';
import { DEFAULT_PRICE_PER_VEHICLE_PENCE, ukDay } from '../domain/plan.js';
import type { Forbidden } from './billing-details.js';
import type { CompanyDirectory } from './ports/company-directory.js';
import type { CostRepository } from './ports/cost-repository.js';
import type { StaffCaller } from './ports/directories.js';
import type { InvoiceRepository } from './ports/invoice-repository.js';
import type { PlanRepository } from './ports/plan-repository.js';
import { listPlans } from './plans.js';

export type CostNotFound = TaggedError<'CostNotFound'>;

export interface FinanceDeps {
  readonly costs: CostRepository;
  readonly invoices: InvoiceRepository;
  readonly plans: PlanRepository;
  readonly companies: CompanyDirectory;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

const isAdmin = (caller: StaffCaller): boolean => caller.kind === 'platform';
const forbidden = (): Result<never, Forbidden> => err({ tag: 'Forbidden' });

/** The current UK month, `YYYY-MM`. */
const thisMonth = (deps: Pick<FinanceDeps, 'clock'>): MonthString =>
  ukDay(deps.clock.now()).slice(0, 7);

export interface CostInput {
  readonly category: string;
  readonly description: string;
  readonly amountPence: number;
}

/**
 * A new cost from `fromMonth`. It carries on every month until it is changed or stopped, unless it is a one-off, which
 * applies to that month alone.
 */
export async function addCost(
  deps: FinanceDeps,
  caller: StaffCaller,
  staffId: StaffId,
  input: CostInput & { readonly fromMonth: string; readonly oneOff: boolean },
): Promise<Result<Cost, Forbidden | InvalidCost | InvalidMonth>> {
  if (!isAdmin(caller)) return forbidden();
  const fields = validateCostFields(input);
  if (!fields.ok) return fields;
  const from = validateMonth(input.fromMonth);
  if (!from.ok) return from;
  const cost: Cost = {
    id: makeId<'CostId'>(deps.ids.newId()),
    ...fields.value,
    fromMonth: from.value,
    toMonth: input.oneOff ? from.value : undefined,
  };
  await deps.costs.insert(cost, staffId, deps.clock.now());
  return ok(cost);
}

/**
 * Changes a cost from `fromMonth` on. The months before keep what they had: from a later month the old entry ends
 * the month before and a new one carries the new amount on, so a past month's profit never moves. Returns the entry
 * that now applies.
 */
export async function changeCost(
  deps: FinanceDeps,
  caller: StaffCaller,
  staffId: StaffId,
  id: CostId,
  input: CostInput & { readonly fromMonth: string },
): Promise<
  Result<Cost, Forbidden | CostNotFound | InvalidCost | InvalidMonth | InvalidCostChange>
> {
  if (!isAdmin(caller)) return forbidden();
  const existing = await deps.costs.findById(id);
  if (existing === null) return err({ tag: 'CostNotFound' });
  const fields = validateCostFields(input);
  if (!fields.ok) return fields;
  const from = validateMonth(input.fromMonth);
  if (!from.ok) return from;
  const plan = planChange(existing, from.value);
  if (!plan.ok) return plan;

  if (plan.value.kind === 'update') {
    await deps.costs.updateFields(id, fields.value);
    return ok({ ...existing, ...fields.value });
  }
  await deps.costs.setToMonth(id, plan.value.closeTo);
  const next: Cost = {
    id: makeId<'CostId'>(deps.ids.newId()),
    ...fields.value,
    fromMonth: plan.value.newFrom,
    toMonth: existing.toMonth,
  };
  await deps.costs.insert(next, staffId, deps.clock.now());
  return ok(next);
}

/** Stops a cost from `fromMonth` on: it last applies the month before. Stopped from its first month, it is removed. */
export async function stopCost(
  deps: FinanceDeps,
  caller: StaffCaller,
  id: CostId,
  fromMonth: string,
): Promise<Result<void, Forbidden | CostNotFound | InvalidMonth | InvalidCostChange>> {
  if (!isAdmin(caller)) return forbidden();
  const existing = await deps.costs.findById(id);
  if (existing === null) return err({ tag: 'CostNotFound' });
  const from = validateMonth(fromMonth);
  if (!from.ok) return from;
  const plan = planStop(existing, from.value);
  if (!plan.ok) return plan;
  if (plan.value.kind === 'remove') await deps.costs.delete(id);
  else await deps.costs.setToMonth(id, plan.value.toMonth);
  return ok(undefined);
}

/** Removes an entry altogether, for one entered by mistake. To end a cost that was real, stop it instead. */
export async function deleteCost(
  deps: FinanceDeps,
  caller: StaffCaller,
  id: CostId,
): Promise<Result<void, Forbidden | CostNotFound>> {
  if (!isAdmin(caller)) return forbidden();
  if ((await deps.costs.findById(id)) === null) return err({ tag: 'CostNotFound' });
  await deps.costs.delete(id);
  return ok(undefined);
}

export interface FinanceReport {
  /** The twelve months ending at `month`, oldest first. */
  readonly months: readonly MonthFigures[];
  readonly month: MonthString;
  /** The costs in force in `month`, each with its own months, so they can be changed or stopped. */
  readonly costs: readonly Cost[];
  readonly revenueByCompany: readonly CompanyRevenue[];
  readonly projection: Projection;
  /** The current UK month, which the projection looks forward from. */
  readonly currentMonth: MonthString;
}

/**
 * What came in and what went out. Twelve months of invoiced and received revenue against the costs standing in each
 * (so a cost entered once shows in every month it applied), the selected month in detail, and a look ahead at today's
 * plans against today's standing costs. Only issued and paid invoices count; drafts and cancelled ones never do.
 */
export async function financeReport(
  deps: FinanceDeps,
  caller: StaffCaller,
  rawMonth: string | undefined,
): Promise<Result<FinanceReport, Forbidden | InvalidMonth>> {
  if (!isAdmin(caller)) return forbidden();
  const current = thisMonth(deps);
  const month = validateMonth(rawMonth ?? current);
  if (!month.ok) return month;

  const [invoices, costs, plans] = await Promise.all([
    deps.invoices.list(),
    deps.costs.list(),
    listPlans(deps, caller),
  ]);
  if (!plans.ok) return plans;

  return ok({
    months: monthsEndingAt(month.value, 12).map((m) => monthFigures(m, invoices, costs)),
    month: month.value,
    costs: activeCosts(costs, month.value),
    revenueByCompany: revenueByCompany(invoices, month.value),
    projection: projection({
      plans: plans.value,
      monthlyCostsPence: costsTotal(costs, current),
      defaultPricePence: DEFAULT_PRICE_PER_VEHICLE_PENCE,
    }),
    currentMonth: current,
  });
}
