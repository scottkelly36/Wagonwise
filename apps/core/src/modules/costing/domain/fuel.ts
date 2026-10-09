import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type CompanyId = Id<'CompanyId'>;
export type StaffId = Id<'StaffId'>;
export type VehicleId = Id<'FleetVehicleId'>;
export type FuelImportId = Id<'FuelImportId'>;
export type FuelTransactionId = Id<'FuelTransactionId'>;

/** The most rows one import takes; a longer statement is sent in more than one go (and re-sending is harmless). */
export const MAX_IMPORT_ROWS = 2000;
/** A single purchase over this, in pence (£100,000), is a typing or mapping slip, not fuel. */
export const MAX_AMOUNT_PENCE = 10_000_000;
export const MAX_LITRES = 5000;

/** "ab12 cde" and "AB12CDE" are the same registration. */
export const normaliseRegistration = (value: string): string =>
  value.replace(/\s+/g, '').toUpperCase();

/** One purchase as the dashboard sends it, read from a statement's columns. */
export interface FuelRowInput {
  /** ISO time of the purchase. */
  readonly occurredAt: string;
  readonly registration: string;
  readonly litres?: number | undefined;
  /** Whole pence; negative for a credit. */
  readonly amountPence: number;
  readonly description?: string | undefined;
}

export interface FuelTransaction {
  readonly id: FuelTransactionId;
  readonly companyId: CompanyId;
  readonly importId: FuelImportId;
  readonly occurredAt: Date;
  readonly registration: string;
  readonly vehicleId: VehicleId | undefined;
  readonly litres: number | undefined;
  readonly amountPence: number;
  readonly description: string | undefined;
  readonly dedupeKey: string;
}

export interface FuelImport {
  readonly id: FuelImportId;
  readonly companyId: CompanyId;
  readonly fileName: string;
  readonly importedAt: Date;
  readonly importedBy: StaffId | undefined;
  readonly rowsTotal: number;
  readonly rowsImported: number;
  readonly rowsDuplicate: number;
}

export interface InvalidFuelRow extends TaggedError<'InvalidFuelRow'> {
  readonly reason: 'bad_date' | 'bad_amount' | 'bad_litres' | 'no_registration';
}

/** Checks one row and tidies it (registration in capitals, no spaces; litres to two places). */
/** A row that has been checked and tidied. */
export interface CheckedFuelRow {
  readonly occurredAt: Date;
  readonly registration: string;
  readonly litres: number | undefined;
  readonly amountPence: number;
  readonly description: string | undefined;
}

export function validateFuelRow(row: FuelRowInput): Result<CheckedFuelRow, InvalidFuelRow> {
  const occurredAt = new Date(row.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) return err({ tag: 'InvalidFuelRow', reason: 'bad_date' });
  const registration = normaliseRegistration(row.registration);
  if (registration === '' || registration.length > 20) {
    return err({ tag: 'InvalidFuelRow', reason: 'no_registration' });
  }
  if (
    !Number.isInteger(row.amountPence) ||
    Math.abs(row.amountPence) > MAX_AMOUNT_PENCE ||
    row.amountPence === 0
  ) {
    return err({ tag: 'InvalidFuelRow', reason: 'bad_amount' });
  }
  if (row.litres !== undefined && (!(row.litres >= 0) || row.litres > MAX_LITRES)) {
    return err({ tag: 'InvalidFuelRow', reason: 'bad_litres' });
  }
  const description = row.description?.trim();
  return ok({
    occurredAt,
    registration,
    litres: row.litres === undefined ? undefined : Math.round(row.litres * 100) / 100,
    amountPence: row.amountPence,
    description:
      description === undefined || description === '' ? undefined : description.slice(0, 120),
  });
}

/**
 * What makes a purchase "the same one" when a statement is sent again: the moment, the registration, the amount, the litres
 * and the description, plus which of identical rows it is within its file. Two genuinely identical purchases in one file
 * (same minute, same amount) both stay, because they are the first and second of their kind; sending the file again finds
 * the same first and second and adds nothing.
 */
export function dedupeKeys(rows: readonly CheckedFuelRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = [
      r.occurredAt.toISOString(),
      r.registration,
      r.amountPence,
      r.litres ?? '',
      r.description ?? '',
    ].join('|');
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}#${n}`;
  });
}

export interface FuelSummaryLine {
  /** The vehicle's id, or `undefined` for purchases not matched to a vehicle. */
  readonly vehicleId: VehicleId | undefined;
  readonly registration: string | undefined;
  readonly purchases: number;
  readonly litres: number;
  /** Litres are only counted for purchases that gave them; so is the price per litre. */
  readonly amountPence: number;
  readonly pencePerLitre: number | undefined;
}

/**
 * Fuel by vehicle for the purchases given: what was spent, the litres bought and the average price per litre (worked out only
 * over purchases that gave litres, so a statement with no litres column still totals the money). Biggest spend first.
 */
export function summariseByVehicle(transactions: readonly FuelTransaction[]): FuelSummaryLine[] {
  const lines = new Map<
    string,
    {
      vehicleId: VehicleId | undefined;
      registration: string | undefined;
      purchases: number;
      litres: number;
      amountPence: number;
      pennyWithLitres: number;
    }
  >();
  for (const t of transactions) {
    const key = t.vehicleId ?? 'unmatched';
    const line = lines.get(key) ?? {
      vehicleId: t.vehicleId,
      registration: t.vehicleId === undefined ? undefined : t.registration,
      purchases: 0,
      litres: 0,
      amountPence: 0,
      pennyWithLitres: 0,
    };
    line.purchases += 1;
    line.amountPence += t.amountPence;
    if (t.litres !== undefined && t.litres > 0) {
      line.litres += t.litres;
      line.pennyWithLitres += t.amountPence;
    }
    lines.set(key, line);
  }
  return [...lines.values()]
    .map((l) => ({
      vehicleId: l.vehicleId,
      registration: l.registration,
      purchases: l.purchases,
      litres: Math.round(l.litres * 100) / 100,
      amountPence: l.amountPence,
      pencePerLitre: l.litres > 0 ? Math.round(l.pennyWithLitres / l.litres) : undefined,
    }))
    .sort((a, b) => b.amountPence - a.amountPence);
}
