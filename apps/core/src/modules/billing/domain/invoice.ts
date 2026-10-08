import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { BillingDetails } from './billing-details.js';
import { capacityOn, type CapacityChange, type CompanyId } from './plan.js';

export type InvoiceId = Id<'InvoiceId'>;
export type InvoiceLineId = Id<'InvoiceLineId'>;

/** A calendar month as `YYYY-MM`. */
export type MonthString = string;

/**
 * draft: being prepared, anything can change, no number yet.
 * issued: has its number and is frozen; sent to the company.
 * paid: money received.
 * void: cancelled after issue. Keeps its number, so numbers never have gaps, and the month can be invoiced again.
 */
export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void';

export interface InvoiceLine {
  readonly id: InvoiceLineId;
  readonly description: string;
  /** Vehicles, or 1 for a manual line. */
  readonly quantity: number;
  /** Price of one, in pence. */
  readonly unitPence: number;
  /** What this line adds to the total, in pence; negative for a credit. Not always quantity times unit: a
   *  part-month is pro rata, and the description says so. */
  readonly amountPence: number;
}

export interface Invoice {
  readonly id: InvoiceId;
  readonly companyId: CompanyId;
  readonly companyName: string;
  readonly month: MonthString;
  readonly status: InvoiceStatus;
  /** `INV-0001`: given at issue, never reused. */
  readonly number: string | undefined;
  readonly lines: readonly InvoiceLine[];
  readonly createdAt: Date;
  readonly issuedAt: Date | undefined;
  readonly paidAt: Date | undefined;
  readonly voidedAt: Date | undefined;
  /** WagonWise's billing details as they stood at issue, so a later change never alters a sent invoice. */
  readonly issuedDetails: BillingDetails | undefined;
}

export type InvoiceNotFound = TaggedError<'InvoiceNotFound'>;
export type InvalidMonth = TaggedError<'InvalidMonth'>;
export type InvalidLine = TaggedError<'InvalidLine'>;
/** The invoice is not in a state that allows this (e.g. editing one that has been issued). */
export interface InvalidInvoiceState extends TaggedError<'InvalidInvoiceState'> {
  readonly status: InvoiceStatus;
}
/** Issuing is refused while WagonWise's own billing details still hold `[placeholders]`. */
export interface BillingDetailsIncomplete extends TaggedError<'BillingDetailsIncomplete'> {
  readonly fields: readonly string[];
}
export type NegativeTotal = TaggedError<'NegativeTotal'>;

export const MAX_LINE_DESCRIPTION = 200;
export const MAX_LINE_PENCE = 100_000_000;

export const totalPence = (lines: readonly { readonly amountPence: number }[]): number =>
  lines.reduce((sum, l) => sum + l.amountPence, 0);

export function validateMonth(raw: string): Result<MonthString, InvalidMonth> {
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  const month = match ? Number(match[2]) : 0;
  return month >= 1 && month <= 12 ? ok(raw) : err({ tag: 'InvalidMonth' });
}

export function daysInMonth(month: MonthString): number {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

/** `2026-10` → "October 2026". */
export function monthName(month: MonthString): string {
  return new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** A manual line (a credit, a set-up charge): text and a whole number of pence, possibly negative. */
export function validateManualLine(
  description: string,
  amountPence: number,
): Result<{ description: string; amountPence: number }, InvalidLine> {
  const text = description.trim();
  const valid =
    text.length > 0 &&
    text.length <= MAX_LINE_DESCRIPTION &&
    Number.isInteger(amountPence) &&
    Math.abs(amountPence) <= MAX_LINE_PENCE;
  return valid ? ok({ description: text, amountPence }) : err({ tag: 'InvalidLine' });
}

export interface PlannedLine {
  readonly description: string;
  readonly quantity: number;
  readonly unitPence: number;
  readonly amountPence: number;
}

const vehicles = (n: number): string => `${n} vehicle${n === 1 ? '' : 's'}`;

/**
 * The plan lines for one month, from the company's capacity changes and its price per vehicle.
 *
 * The capacity in force on the 1st is billed for the whole month. If capacity rises part-way through, the
 * extra vehicles are billed from that day, pro rata by days. If it falls part-way through, nothing changes
 * until next month: the company committed to that capacity for the month. A fall followed by a smaller rise
 * does not count as a rise, because the month was already billed at the higher level.
 */
export function buildPlanLines(
  changes: readonly CapacityChange[],
  pricePerVehiclePence: number,
  month: MonthString,
): PlannedLine[] {
  const days = daysInMonth(month);
  const first = `${month}-01`;
  const lines: PlannedLine[] = [];

  const base = capacityOn(changes, first);
  if (base > 0) {
    lines.push({
      description: `${vehicles(base)} covered, ${monthName(month)}`,
      quantity: base,
      unitPence: pricePerVehiclePence,
      amountPence: base * pricePerVehiclePence,
    });
  }

  let level = base;
  const during = changes
    .filter((c) => c.effectiveFrom > first && c.effectiveFrom.startsWith(month))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  for (const change of during) {
    if (change.capacity <= level) continue;
    const extra = change.capacity - level;
    const day = Number(change.effectiveFrom.slice(8, 10));
    const daysCovered = days - day + 1;
    lines.push({
      description: `${vehicles(extra)} added from ${day} ${monthName(month)} (${daysCovered} of ${days} days)`,
      quantity: extra,
      unitPence: pricePerVehiclePence,
      amountPence: Math.round((extra * pricePerVehiclePence * daysCovered) / days),
    });
    level = change.capacity;
  }
  return lines;
}
