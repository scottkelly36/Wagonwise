import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type CompanyId = Id<'CompanyId'>;

/** A calendar day as `YYYY-MM-DD`, in UK time. Plain text so it sorts and compares as it reads. */
export type DayString = string;

export const DEFAULT_PRICE_PER_VEHICLE_PENCE = 1000;
export const MAX_PRICE_PER_VEHICLE_PENCE = 1_000_000;
export const MAX_CAPACITY = 10_000;

/** What a company pays for: a price per vehicle. Capacity is separate because it changes over time. */
export interface Plan {
  readonly companyId: CompanyId;
  readonly pricePerVehiclePence: number;
}

/** From `effectiveFrom`, the company's plan covers `capacity` vehicles (until a later change). */
export interface CapacityChange {
  readonly companyId: CompanyId;
  readonly effectiveFrom: DayString;
  readonly capacity: number;
}

export type InvalidPrice = TaggedError<'InvalidPrice'>;
export type InvalidCapacity = TaggedError<'InvalidCapacity'>;
export type InvalidDay = TaggedError<'InvalidDay'>;
/** Capacity can be set from today or for a future day, never for a past one, so what was billed
 *  for an earlier day cannot change under an invoice. */
export type DayInPast = TaggedError<'DayInPast'>;

export function validatePrice(pence: number): Result<number, InvalidPrice> {
  return Number.isInteger(pence) && pence >= 0 && pence <= MAX_PRICE_PER_VEHICLE_PENCE
    ? ok(pence)
    : err({ tag: 'InvalidPrice' });
}

export function validateCapacity(capacity: number): Result<number, InvalidCapacity> {
  return Number.isInteger(capacity) && capacity >= 0 && capacity <= MAX_CAPACITY
    ? ok(capacity)
    : err({ tag: 'InvalidCapacity' });
}

/** A real calendar day (`2026-02-30` is not). */
export function validateDay(raw: string): Result<DayString, InvalidDay> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return err({ tag: 'InvalidDay' });
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw
    ? err({ tag: 'InvalidDay' })
    : ok(raw);
}

/** The UK calendar day an instant falls on: a 23:30 UTC instant in summer is already tomorrow here. */
export function ukDay(at: Date): DayString {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The capacity in force on `day`: the latest change on or before it, or 0 when there is none. */
export function capacityOn(changes: readonly CapacityChange[], day: DayString): number {
  let current: CapacityChange | undefined;
  for (const change of changes) {
    if (change.effectiveFrom <= day && (!current || change.effectiveFrom > current.effectiveFrom)) {
      current = change;
    }
  }
  return current?.capacity ?? 0;
}

/** The first change that has not started yet, if any. */
export function nextChangeAfter(
  changes: readonly CapacityChange[],
  day: DayString,
): CapacityChange | undefined {
  return [...changes]
    .filter((c) => c.effectiveFrom > day)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
}
