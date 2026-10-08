import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import { totalPence, type Invoice, type MonthString } from './invoice.js';
import type { CompanyId } from './plan.js';

export type CostId = Id<'CostId'>;

export const COST_CATEGORIES = [
  'hosting',
  'maps',
  'messaging',
  'software',
  'wages',
  'other',
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const MAX_COST_DESCRIPTION = 120;
export const MAX_COST_PENCE = 100_000_000;

/**
 * A cost WagonWise carries. It applies from `fromMonth` and every month after until `toMonth` (or for ever, when that
 * is absent), so a regular bill is entered once. A one-off has the same first and last month.
 */
export interface Cost {
  readonly id: CostId;
  readonly category: CostCategory;
  readonly description: string;
  readonly amountPence: number;
  readonly fromMonth: MonthString;
  readonly toMonth: MonthString | undefined;
}

export interface InvalidCost extends TaggedError<'InvalidCost'> {
  readonly reason: 'category' | 'description' | 'amount';
}
export interface InvalidCostChange extends TaggedError<'InvalidCostChange'> {
  readonly reason: 'before_start' | 'after_end' | 'already_ended';
}

export function isCostCategory(value: string): value is CostCategory {
  return (COST_CATEGORIES as readonly string[]).includes(value);
}

/** Text trimmed, and the amount a whole number of pence from nothing up to a sane limit. */
export function validateCostFields(input: {
  readonly category: string;
  readonly description: string;
  readonly amountPence: number;
}): Result<{ category: CostCategory; description: string; amountPence: number }, InvalidCost> {
  if (!isCostCategory(input.category)) return err({ tag: 'InvalidCost', reason: 'category' });
  const description = input.description.trim();
  if (description.length === 0 || description.length > MAX_COST_DESCRIPTION) {
    return err({ tag: 'InvalidCost', reason: 'description' });
  }
  if (
    !Number.isInteger(input.amountPence) ||
    input.amountPence < 0 ||
    input.amountPence > MAX_COST_PENCE
  ) {
    return err({ tag: 'InvalidCost', reason: 'amount' });
  }
  return ok({ category: input.category, description, amountPence: input.amountPence });
}

// --- months ---------------------------------------------------------------------------------

const index = (month: MonthString): number => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return y * 12 + (m - 1);
};
const fromIndex = (i: number): MonthString =>
  `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

export const previousMonth = (month: MonthString): MonthString => fromIndex(index(month) - 1);
export const nextMonth = (month: MonthString): MonthString => fromIndex(index(month) + 1);

/** The `count` months ending at `end`, oldest first. */
export function monthsEndingAt(end: MonthString, count: number): MonthString[] {
  return Array.from({ length: count }, (_, i) => fromIndex(index(end) - (count - 1 - i)));
}

/** Whether the cost applies in that month. */
export function isActiveIn(cost: Pick<Cost, 'fromMonth' | 'toMonth'>, month: MonthString): boolean {
  return cost.fromMonth <= month && (cost.toMonth === undefined || cost.toMonth >= month);
}

export const isOneOff = (cost: Pick<Cost, 'fromMonth' | 'toMonth'>): boolean =>
  cost.toMonth === cost.fromMonth;

export const activeCosts = (costs: readonly Cost[], month: MonthString): Cost[] =>
  costs.filter((c) => isActiveIn(c, month));

export const costsTotal = (costs: readonly Cost[], month: MonthString): number =>
  activeCosts(costs, month).reduce((sum, c) => sum + c.amountPence, 0);

// --- changing a standing cost -----------------------------------------------------------------

export type CostChangePlan =
  /** The change starts when the cost does, so the row itself is updated. */
  | { readonly kind: 'update' }
  /** The change starts later: this row ends the month before, and a new row carries the new values on. */
  | { readonly kind: 'split'; readonly closeTo: MonthString; readonly newFrom: MonthString };

/**
 * How to change a cost from `fromMonth` on without rewriting the months before it. From the month it started, the
 * row is simply updated. From a later month, the old row is closed the month before and a new one starts, so earlier
 * months keep the amount they had. Before it started, or after it ended, there is nothing to change.
 */
export function planChange(
  cost: Pick<Cost, 'fromMonth' | 'toMonth'>,
  fromMonth: MonthString,
): Result<CostChangePlan, InvalidCostChange> {
  if (fromMonth < cost.fromMonth) return err({ tag: 'InvalidCostChange', reason: 'before_start' });
  if (cost.toMonth !== undefined && fromMonth > cost.toMonth) {
    return err({ tag: 'InvalidCostChange', reason: 'after_end' });
  }
  if (fromMonth === cost.fromMonth) return ok({ kind: 'update' });
  return ok({ kind: 'split', closeTo: previousMonth(fromMonth), newFrom: fromMonth });
}

export type CostStopPlan =
  /** Stopping from its first month leaves it never having applied, so it is removed. */
  { readonly kind: 'remove' } | { readonly kind: 'end'; readonly toMonth: MonthString };

/** How to stop a cost from `fromMonth` on: it last applies the month before. */
export function planStop(
  cost: Pick<Cost, 'fromMonth' | 'toMonth'>,
  fromMonth: MonthString,
): Result<CostStopPlan, InvalidCostChange> {
  if (cost.toMonth !== undefined && fromMonth > cost.toMonth) {
    return err({ tag: 'InvalidCostChange', reason: 'already_ended' });
  }
  if (fromMonth <= cost.fromMonth) return ok({ kind: 'remove' });
  return ok({ kind: 'end', toMonth: previousMonth(fromMonth) });
}

// --- the report ---------------------------------------------------------------------------------

export interface MonthFigures {
  readonly month: MonthString;
  /** Issued and paid invoices for the month, not cancelled or draft ones. */
  readonly invoicedPence: number;
  /** Of those, the ones marked paid. */
  readonly receivedPence: number;
  readonly costsPence: number;
  readonly profitInvoicedPence: number;
  readonly profitReceivedPence: number;
}

export interface CompanyRevenue {
  readonly companyId: CompanyId;
  readonly name: string;
  readonly invoicedPence: number;
  readonly receivedPence: number;
}

/** An invoice counts as revenue once it is issued, and stops counting if it is cancelled. */
const counts = (invoice: Pick<Invoice, 'status'>): boolean =>
  invoice.status === 'issued' || invoice.status === 'paid';

export function revenueFor(
  invoices: readonly Invoice[],
  month: MonthString,
): { invoicedPence: number; receivedPence: number } {
  let invoicedPence = 0;
  let receivedPence = 0;
  for (const invoice of invoices) {
    if (invoice.month !== month || !counts(invoice)) continue;
    const total = totalPence(invoice.lines);
    invoicedPence += total;
    if (invoice.status === 'paid') receivedPence += total;
  }
  return { invoicedPence, receivedPence };
}

export function revenueByCompany(
  invoices: readonly Invoice[],
  month: MonthString,
): CompanyRevenue[] {
  const byCompany = new Map<string, CompanyRevenue>();
  for (const invoice of invoices) {
    if (invoice.month !== month || !counts(invoice)) continue;
    const total = totalPence(invoice.lines);
    const before = byCompany.get(invoice.companyId);
    byCompany.set(invoice.companyId, {
      companyId: invoice.companyId,
      name: invoice.companyName,
      invoicedPence: (before?.invoicedPence ?? 0) + total,
      receivedPence: (before?.receivedPence ?? 0) + (invoice.status === 'paid' ? total : 0),
    });
  }
  return [...byCompany.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** One row per month: what was invoiced and received, what it cost, and what was left. */
export function monthFigures(
  month: MonthString,
  invoices: readonly Invoice[],
  costs: readonly Cost[],
): MonthFigures {
  const revenue = revenueFor(invoices, month);
  const costsPence = costsTotal(costs, month);
  return {
    month,
    ...revenue,
    costsPence,
    profitInvoicedPence: revenue.invoicedPence - costsPence,
    profitReceivedPence: revenue.receivedPence - costsPence,
  };
}

export interface Projection {
  /** What the current plans bring in a month: vehicles covered times each company's price. */
  readonly monthlyRevenuePence: number;
  /** The costs standing this month, as they will carry on unless changed. */
  readonly monthlyCostsPence: number;
  readonly projectedProfitPence: number;
  /** Vehicles covered across all plans. */
  readonly vehiclesCovered: number;
  /** The average price per covered vehicle, in pence; the default when nothing is covered yet. */
  readonly averagePricePence: number;
  /** How many covered vehicles pay for the costs at that average price; `null` if the price is nothing. */
  readonly breakEvenVehicles: number | null;
}

/** Looking ahead at today's plans and today's standing costs. Pure arithmetic on what is already known. */
export function projection(input: {
  readonly plans: readonly {
    readonly capacityToday: number;
    readonly pricePerVehiclePence: number;
  }[];
  readonly monthlyCostsPence: number;
  readonly defaultPricePence: number;
}): Projection {
  const vehiclesCovered = input.plans.reduce((sum, p) => sum + p.capacityToday, 0);
  const monthlyRevenuePence = input.plans.reduce(
    (sum, p) => sum + p.capacityToday * p.pricePerVehiclePence,
    0,
  );
  const averagePricePence =
    vehiclesCovered > 0
      ? Math.round(monthlyRevenuePence / vehiclesCovered)
      : input.defaultPricePence;
  return {
    monthlyRevenuePence,
    monthlyCostsPence: input.monthlyCostsPence,
    projectedProfitPence: monthlyRevenuePence - input.monthlyCostsPence,
    vehiclesCovered,
    averagePricePence,
    breakEvenVehicles:
      averagePricePence > 0 ? Math.ceil(input.monthlyCostsPence / averagePricePence) : null,
  };
}
