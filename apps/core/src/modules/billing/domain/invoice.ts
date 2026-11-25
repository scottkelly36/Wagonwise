import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { BillingDetails } from './billing-details.js';
import type { CompanyId } from './plan.js';

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

/** A day as `YYYY-MM-DD`. */
type Day = string;

/** One vehicle's record of being used: the UK day of its first use ever, and whether it was used in the month being billed. */
export interface VehicleUse {
  readonly vehicleId: string;
  readonly firstDay: Day;
  readonly usedInMonth: boolean;
}

/** A vehicle first used in the last this-many days of a month is not billed for that month, only from the next month it is used in. */
export const NEW_VEHICLE_GRACE_DAYS = 7;

/**
 * Whether a company's free trial covers the month, so it is not billed for it. A trial that ends on a day in the month, or later, covers
 * it; the first month billed is the first full month after the trial ends (the owner's rule: a trial ending on 23 February bills from
 * March). A company with no trial end (one set up by hand, or from before trials) is billed as usual.
 */
export function trialCoversMonth(
  trialEndsOn: string | null | undefined,
  month: MonthString,
): boolean {
  return trialEndsOn !== null && trialEndsOn !== undefined && trialEndsOn >= `${month}-01`;
}

/** The month before `month`, across a year end: `2027-01` is `2026-12`. */
export function previousMonth(month: MonthString): MonthString {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`;
}

/** The first day of the month after `month`, as `YYYY-MM-DD`: where a month's range ends (exclusive). */
export function nextMonthStart(month: MonthString): Day {
  const [year, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, '0')}-01`;
}

/**
 * The first day of a month's grace window: the vehicles first used on or after it are not billed for that month.
 * A 30-day month's last 7 days start on the 24th.
 */
export function graceStart(month: MonthString): Day {
  return `${month}-${String(daysInMonth(month) - NEW_VEHICLE_GRACE_DAYS + 1).padStart(2, '0')}`;
}

/**
 * How many vehicles to bill for a month: each one used that month, whose first use ever was before the grace window. A
 * vehicle that never worked costs nothing, and nothing is pro-rated: a vehicle used at all that month is a whole month.
 * This reads what happened, not how many vehicles the company has on the day it is billed, so removing vehicles just before
 * the invoice does not change it.
 */
export function billableVehicles(use: readonly VehicleUse[], month: MonthString): number {
  const grace = graceStart(month);
  return use.filter((v) => v.usedInMonth && v.firstDay < grace).length;
}

/** The plan line for one month: the vehicles used in it, at the company's price per vehicle. No line when none was used. */
export function buildUsageLines(
  use: readonly VehicleUse[],
  pricePerVehiclePence: number,
  month: MonthString,
): PlannedLine[] {
  const count = billableVehicles(use, month);
  if (count === 0 || pricePerVehiclePence === 0) return [];
  return [
    {
      description: `${vehicles(count)} used, ${monthName(month)}`,
      quantity: count,
      unitPence: pricePerVehiclePence,
      amountPence: count * pricePerVehiclePence,
    },
  ];
}
