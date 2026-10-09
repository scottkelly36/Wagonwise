import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  dedupeKeys,
  MAX_IMPORT_ROWS,
  normaliseRegistration,
  summariseByVehicle,
  validateFuelRow,
  type CheckedFuelRow,
  type CompanyId,
  type FuelImport,
  type FuelImportId,
  type FuelRowInput,
  type FuelSummaryLine,
  type FuelTransaction,
  type FuelTransactionId,
  type InvalidFuelRow,
  type StaffId,
  type VehicleId,
} from '../domain/fuel.js';
import type { FuelRepository, StaffCaller, VehicleDirectory, VehicleSummary } from './ports.js';

export type Forbidden = TaggedError<'Forbidden'>;
/** An unknown id, or one belonging to a company the caller cannot see: the same answer, so ids cannot be probed. */
export type NotFound = TaggedError<'NotFound'>;
export type TooManyRows = TaggedError<'TooManyRows'>;
export type NoRows = TaggedError<'NoRows'>;
export type VehicleNotFound = TaggedError<'VehicleNotFound'>;

export interface FuelDeps {
  readonly fuel: FuelRepository;
  readonly vehicles: VehicleDirectory;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** Whoever manages the fleet (or WagonWise) imports statements and matches purchases to vehicles. */
export const canManage = (caller: StaffCaller, companyId: CompanyId): boolean =>
  caller.kind === 'platform' ||
  (caller.companyId === companyId && caller.privileges.includes('manage_fleet'));

/** Reading the fuel also needs `view_reports`, since the figures are the firm's costs. */
export const canView = (caller: StaffCaller, companyId: CompanyId): boolean =>
  canManage(caller, companyId) ||
  (caller.kind === 'fleet' &&
    caller.companyId === companyId &&
    caller.privileges.includes('view_reports'));

const sees = (caller: StaffCaller, companyId: CompanyId): boolean =>
  caller.kind === 'platform' || caller.companyId === companyId;

/** The vehicle a registration belongs to, if exactly one does; two vehicles with the same registration are not guessed at. */
function vehicleFor(
  registration: string,
  vehicles: readonly VehicleSummary[],
): VehicleId | undefined {
  const matches = vehicles.filter(
    (v) => v.registration !== undefined && normaliseRegistration(v.registration) === registration,
  );
  return matches.length === 1 ? matches[0]?.id : undefined;
}

export interface ImportOutcome {
  /** `undefined` when nothing new came in, so no import is recorded. */
  readonly importId: FuelImportId | undefined;
  readonly imported: number;
  readonly duplicates: number;
  /** Rows that could not be read, by their position in the file (1 is the first row sent). */
  readonly invalid: readonly { readonly row: number; readonly reason: InvalidFuelRow['reason'] }[];
  readonly matched: number;
  readonly unmatched: number;
  /** The registrations (as written) that matched no vehicle, so the firm can add them. */
  readonly unmatchedRegistrations: readonly string[];
}

/**
 * Imports the purchases from a fuel card statement. Each is matched to a vehicle by registration; one that matches none is
 * still kept (unmatched), so the money is not lost and the firm can add the registration later and match it. A purchase
 * already held (the same statement sent twice) is skipped. Rows that cannot be read are reported, and the rest still go in.
 */
export async function importFuel(
  deps: FuelDeps,
  caller: StaffCaller,
  staffId: StaffId,
  companyId: CompanyId,
  fileName: string,
  rows: readonly FuelRowInput[],
): Promise<Result<ImportOutcome, Forbidden | TooManyRows | NoRows>> {
  if (!canManage(caller, companyId)) return err({ tag: 'Forbidden' });
  if (rows.length === 0) return err({ tag: 'NoRows' });
  if (rows.length > MAX_IMPORT_ROWS) return err({ tag: 'TooManyRows' });

  const invalid: { row: number; reason: InvalidFuelRow['reason'] }[] = [];
  const valid: CheckedFuelRow[] = [];
  rows.forEach((row, index) => {
    const checked = validateFuelRow(row);
    if (checked.ok) valid.push(checked.value);
    else invalid.push({ row: index + 1, reason: checked.error.reason });
  });

  const keys = dedupeKeys(valid);
  const held = await deps.fuel.existingKeys(companyId, keys);
  const vehicles = await deps.vehicles.listForCompany(companyId);
  const now = deps.clock.now();
  const importId = makeId<'FuelImportId'>(deps.ids.newId());

  const fresh: FuelTransaction[] = [];
  valid.forEach((row, i) => {
    const key = keys[i] as string;
    if (held.has(key)) return;
    fresh.push({
      id: makeId<'FuelTransactionId'>(deps.ids.newId()),
      companyId,
      importId,
      occurredAt: row.occurredAt,
      registration: row.registration,
      vehicleId: vehicleFor(row.registration, vehicles),
      litres: row.litres,
      amountPence: row.amountPence,
      description: row.description,
      dedupeKey: key,
    });
  });

  const duplicates = valid.length - fresh.length;
  if (fresh.length === 0) {
    return ok({
      importId: undefined,
      imported: 0,
      duplicates,
      invalid,
      matched: 0,
      unmatched: 0,
      unmatchedRegistrations: [],
    });
  }

  const fuelImport: FuelImport = {
    id: importId,
    companyId,
    fileName: fileName.trim().slice(0, 200) || 'Fuel statement',
    importedAt: now,
    importedBy: staffId,
    rowsTotal: rows.length,
    rowsImported: fresh.length,
    rowsDuplicate: duplicates,
  };
  const inserted = await deps.fuel.saveImport(fuelImport, fresh);
  const stored = fresh.filter((t) => inserted.has(t.dedupeKey));
  const unmatched = stored.filter((t) => t.vehicleId === undefined);
  return ok({
    importId,
    imported: stored.length,
    duplicates: duplicates + (fresh.length - stored.length),
    invalid,
    matched: stored.length - unmatched.length,
    unmatched: unmatched.length,
    unmatchedRegistrations: [...new Set(unmatched.map((t) => t.registration))].sort(),
  });
}

export interface FuelView {
  readonly transactions: readonly (FuelTransaction & {
    readonly vehicleName: string | undefined;
  })[];
  readonly byVehicle: readonly (FuelSummaryLine & { readonly vehicleName: string | undefined })[];
  readonly totalPence: number;
  readonly totalLitres: number;
  readonly unmatchedCount: number;
}

/** The purchases from `from` to `to` (exclusive), with the totals by vehicle. */
export async function listFuel(
  deps: Pick<FuelDeps, 'fuel' | 'vehicles'>,
  caller: StaffCaller,
  companyId: CompanyId,
  from: Date,
  to: Date,
): Promise<Result<FuelView, Forbidden>> {
  if (!canView(caller, companyId)) return err({ tag: 'Forbidden' });
  const [transactions, vehicles] = await Promise.all([
    deps.fuel.listBetween(companyId, from, to),
    deps.vehicles.listForCompany(companyId),
  ]);
  const names = new Map(vehicles.map((v) => [v.id, v.name]));
  const byVehicle = summariseByVehicle(transactions).map((line) => ({
    ...line,
    vehicleName: line.vehicleId === undefined ? undefined : names.get(line.vehicleId),
  }));
  return ok({
    transactions: transactions.map((t) => ({
      ...t,
      vehicleName: t.vehicleId === undefined ? undefined : names.get(t.vehicleId),
    })),
    byVehicle,
    totalPence: transactions.reduce((sum, t) => sum + t.amountPence, 0),
    totalLitres: Math.round(transactions.reduce((sum, t) => sum + (t.litres ?? 0), 0) * 100) / 100,
    unmatchedCount: transactions.filter((t) => t.vehicleId === undefined).length,
  });
}

/** Purchases not matched to a vehicle, whatever their date, so none is forgotten. */
export async function listUnmatched(
  deps: Pick<FuelDeps, 'fuel'>,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<FuelTransaction[], Forbidden>> {
  if (!canView(caller, companyId)) return err({ tag: 'Forbidden' });
  return ok(await deps.fuel.listUnmatched(companyId));
}

/** Matches one purchase to a vehicle by hand (or, with `undefined`, takes it off one). */
export async function assignVehicle(
  deps: Pick<FuelDeps, 'fuel' | 'vehicles'>,
  caller: StaffCaller,
  id: FuelTransactionId,
  vehicleId: VehicleId | undefined,
): Promise<Result<void, Forbidden | NotFound | VehicleNotFound>> {
  const tx = await deps.fuel.findTransaction(id);
  if (tx === null || !sees(caller, tx.companyId)) return err({ tag: 'NotFound' });
  if (!canManage(caller, tx.companyId)) return err({ tag: 'Forbidden' });
  if (vehicleId !== undefined) {
    const vehicle = await deps.vehicles.find(vehicleId);
    if (vehicle === null || vehicle.companyId !== tx.companyId)
      return err({ tag: 'VehicleNotFound' });
  }
  await deps.fuel.setVehicle(id, vehicleId);
  return ok(undefined);
}

/** Matches every unmatched purchase whose registration now belongs to exactly one vehicle (after a registration is added). */
export async function rematchFuel(
  deps: Pick<FuelDeps, 'fuel' | 'vehicles'>,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<number, Forbidden>> {
  if (!canManage(caller, companyId)) return err({ tag: 'Forbidden' });
  const [unmatched, vehicles] = await Promise.all([
    deps.fuel.listUnmatched(companyId),
    deps.vehicles.listForCompany(companyId),
  ]);
  let matched = 0;
  for (const t of unmatched) {
    const vehicleId = vehicleFor(t.registration, vehicles);
    if (vehicleId !== undefined) {
      await deps.fuel.setVehicle(t.id, vehicleId);
      matched += 1;
    }
  }
  return ok(matched);
}

export async function listImports(
  deps: Pick<FuelDeps, 'fuel'>,
  caller: StaffCaller,
  companyId: CompanyId,
): Promise<Result<FuelImport[], Forbidden>> {
  if (!canView(caller, companyId)) return err({ tag: 'Forbidden' });
  return ok(await deps.fuel.listImports(companyId));
}

/** Takes back a whole import: every purchase it brought goes. For a wrong file. */
export async function undoImport(
  deps: Pick<FuelDeps, 'fuel'>,
  caller: StaffCaller,
  id: FuelImportId,
): Promise<Result<void, Forbidden | NotFound>> {
  const found = await deps.fuel.findImport(id);
  if (found === null || !sees(caller, found.companyId)) return err({ tag: 'NotFound' });
  if (!canManage(caller, found.companyId)) return err({ tag: 'Forbidden' });
  await deps.fuel.deleteImport(id);
  return ok(undefined);
}
