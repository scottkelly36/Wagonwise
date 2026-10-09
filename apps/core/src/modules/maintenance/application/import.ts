import { err, ok, type Result } from '../../../shared/result.js';
import type { CompanyId, StaffId } from '../domain/maintenance.js';
import { canManage, type Forbidden } from './item-types.js';
import { setDueDate, type ScheduleDeps } from './schedule.js';
import type { StaffCaller } from './ports/directories.js';

/** The most rows one import takes; a bigger fleet is imported in more than one go. */
export const MAX_IMPORT_ROWS = 500;

export interface ImportRow {
  readonly registration: string;
  readonly itemName: string;
  readonly dueDate: string;
}

export type ImportRowResult =
  | { readonly status: 'applied' }
  | {
      readonly status: 'skipped';
      readonly reason:
        | 'unknown_vehicle'
        | 'ambiguous_vehicle'
        | 'unknown_item'
        | 'not_for_vehicle'
        | 'invalid_date';
    };

export interface TooManyRows {
  readonly tag: 'TooManyRows';
}

/** "ab12 cde" and "AB12CDE" are the same registration. */
export const normaliseRegistration = (value: string): string =>
  value.replace(/\s+/g, '').toUpperCase();

/**
 * Sets next-due dates in bulk from a spreadsheet: each row names a vehicle by registration and an item by name (not case
 * sensitive) and gives the date. Every row stands alone: a row that cannot be applied is reported and the rest still go in,
 * so a firm can fix the few bad rows and send the file again (setting the same date twice changes nothing).
 */
export async function importDueDates(
  deps: ScheduleDeps,
  caller: StaffCaller,
  staffId: StaffId,
  companyId: CompanyId,
  rows: readonly ImportRow[],
): Promise<Result<ImportRowResult[], Forbidden | TooManyRows>> {
  if (!canManage(caller, companyId)) return err({ tag: 'Forbidden' });
  if (rows.length > MAX_IMPORT_ROWS) return err({ tag: 'TooManyRows' });

  const [vehicles, items] = await Promise.all([
    deps.vehicles.listForCompany(companyId),
    deps.items.listForCompany(companyId),
  ]);
  const results: ImportRowResult[] = [];
  for (const row of rows) {
    const registration = normaliseRegistration(row.registration);
    const matches = vehicles.filter(
      (v) => v.registration !== undefined && normaliseRegistration(v.registration) === registration,
    );
    const itemName = row.itemName.trim().toLowerCase();
    const item = items.find(
      (i) => i.archivedAt === undefined && i.name.trim().toLowerCase() === itemName,
    );
    const vehicle = matches[0];
    if (registration === '' || vehicle === undefined) {
      results.push({ status: 'skipped', reason: 'unknown_vehicle' });
    } else if (matches.length > 1) {
      results.push({ status: 'skipped', reason: 'ambiguous_vehicle' });
    } else if (item === undefined) {
      results.push({ status: 'skipped', reason: 'unknown_item' });
    } else {
      const set = await setDueDate(deps, caller, staffId, vehicle.id, item.id, row.dueDate);
      if (set.ok) results.push({ status: 'applied' });
      else if (set.error.tag === 'InvalidDay') {
        results.push({ status: 'skipped', reason: 'invalid_date' });
      } else {
        results.push({ status: 'skipped', reason: 'not_for_vehicle' });
      }
    }
  }
  return ok(results);
}
