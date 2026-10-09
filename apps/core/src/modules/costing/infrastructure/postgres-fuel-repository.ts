import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { FuelRepository } from '../application/ports.js';
import type {
  CompanyId,
  FuelImport,
  FuelImportId,
  FuelTransaction,
  FuelTransactionId,
  VehicleId,
} from '../domain/fuel.js';
import type { UntypedDb } from './db.js';

interface TransactionRow {
  readonly id: string;
  readonly company_id: string;
  readonly import_id: string;
  readonly occurred_at: Date;
  readonly registration: string;
  readonly vehicle_id: string | null;
  // numeric and bigint come back as text from pg
  readonly litres: string | null;
  readonly amount_pence: string | number;
  readonly description: string | null;
  readonly dedupe_key: string;
}

interface ImportRow {
  readonly id: string;
  readonly company_id: string;
  readonly file_name: string;
  readonly imported_at: Date;
  readonly imported_by: string | null;
  readonly rows_total: number;
  readonly rows_imported: number;
  readonly rows_duplicate: number;
}

const TX_COLUMNS = `id, company_id, import_id, occurred_at, registration, vehicle_id, litres, amount_pence,
  description, dedupe_key`;

const toTransaction = (r: TransactionRow): FuelTransaction => ({
  id: makeId<'FuelTransactionId'>(r.id),
  companyId: makeId<'CompanyId'>(r.company_id),
  importId: makeId<'FuelImportId'>(r.import_id),
  occurredAt: r.occurred_at,
  registration: r.registration,
  vehicleId: r.vehicle_id === null ? undefined : makeId<'FleetVehicleId'>(r.vehicle_id),
  litres: r.litres === null ? undefined : Number(r.litres),
  amountPence: Number(r.amount_pence),
  description: r.description ?? undefined,
  dedupeKey: r.dedupe_key,
});

const toImport = (r: ImportRow): FuelImport => ({
  id: makeId<'FuelImportId'>(r.id),
  companyId: makeId<'CompanyId'>(r.company_id),
  fileName: r.file_name,
  importedAt: r.imported_at,
  importedBy: r.imported_by === null ? undefined : makeId<'StaffId'>(r.imported_by),
  rowsTotal: r.rows_total,
  rowsImported: r.rows_imported,
  rowsDuplicate: r.rows_duplicate,
});

/** Raw `sql` like every repository here (decision 26). Row-Level Security (migration 0056) limits a request to its own
 *  company's rows. */
export class PostgresFuelRepository implements FuelRepository {
  constructor(private readonly db: UntypedDb) {}

  async existingKeys(companyId: CompanyId, keys: readonly string[]): Promise<ReadonlySet<string>> {
    if (keys.length === 0) return new Set();
    const { rows } = await sql<{ dedupe_key: string }>`
      select dedupe_key from costing.fuel_transactions
      where company_id = ${companyId} and dedupe_key in (${sql.join(keys)})
    `.execute(this.db);
    return new Set(rows.map((r) => r.dedupe_key));
  }

  async saveImport(
    fuelImport: FuelImport,
    transactions: readonly FuelTransaction[],
  ): Promise<ReadonlySet<string>> {
    await sql`
      insert into costing.fuel_imports
        (id, company_id, file_name, imported_at, imported_by, rows_total, rows_imported, rows_duplicate)
      values (${fuelImport.id}, ${fuelImport.companyId}, ${fuelImport.fileName}, ${fuelImport.importedAt},
              ${fuelImport.importedBy ?? null}, ${fuelImport.rowsTotal}, ${fuelImport.rowsImported},
              ${fuelImport.rowsDuplicate})
    `.execute(this.db);
    const inserted = new Set<string>();
    for (const t of transactions) {
      // `on conflict do nothing`: a row another request stored a moment ago is skipped, not an error.
      const result = await sql`
        insert into costing.fuel_transactions
          (id, company_id, import_id, occurred_at, registration, vehicle_id, litres, amount_pence, description, dedupe_key)
        values (${t.id}, ${t.companyId}, ${t.importId}, ${t.occurredAt}, ${t.registration}, ${t.vehicleId ?? null},
                ${t.litres ?? null}, ${t.amountPence}, ${t.description ?? null}, ${t.dedupeKey})
        on conflict (company_id, dedupe_key) do nothing
      `.execute(this.db);
      if (Number(result.numAffectedRows ?? 0) > 0) inserted.add(t.dedupeKey);
    }
    if (inserted.size !== fuelImport.rowsImported) {
      await sql`
        update costing.fuel_imports
        set rows_imported = ${inserted.size},
            rows_duplicate = rows_duplicate + ${fuelImport.rowsImported - inserted.size}
        where id = ${fuelImport.id}
      `.execute(this.db);
    }
    return inserted;
  }

  async listBetween(companyId: CompanyId, from: Date, to: Date): Promise<FuelTransaction[]> {
    const { rows } = await sql<TransactionRow>`
      select ${sql.raw(TX_COLUMNS)} from costing.fuel_transactions
      where company_id = ${companyId} and occurred_at >= ${from} and occurred_at < ${to}
      order by occurred_at desc, id
    `.execute(this.db);
    return rows.map(toTransaction);
  }

  async listUnmatched(companyId: CompanyId): Promise<FuelTransaction[]> {
    const { rows } = await sql<TransactionRow>`
      select ${sql.raw(TX_COLUMNS)} from costing.fuel_transactions
      where company_id = ${companyId} and vehicle_id is null
      order by occurred_at desc, id
    `.execute(this.db);
    return rows.map(toTransaction);
  }

  async findTransaction(id: FuelTransactionId): Promise<FuelTransaction | null> {
    const { rows } = await sql<TransactionRow>`
      select ${sql.raw(TX_COLUMNS)} from costing.fuel_transactions where id = ${id}
    `.execute(this.db);
    return rows[0] ? toTransaction(rows[0]) : null;
  }

  async setVehicle(id: FuelTransactionId, vehicleId: VehicleId | undefined): Promise<void> {
    await sql`
      update costing.fuel_transactions set vehicle_id = ${vehicleId ?? null} where id = ${id}
    `.execute(this.db);
  }

  async listImports(companyId: CompanyId): Promise<FuelImport[]> {
    const { rows } = await sql<ImportRow>`
      select id, company_id, file_name, imported_at, imported_by, rows_total, rows_imported, rows_duplicate
      from costing.fuel_imports where company_id = ${companyId} order by imported_at desc, id
    `.execute(this.db);
    return rows.map(toImport);
  }

  async findImport(id: FuelImportId): Promise<FuelImport | null> {
    const { rows } = await sql<ImportRow>`
      select id, company_id, file_name, imported_at, imported_by, rows_total, rows_imported, rows_duplicate
      from costing.fuel_imports where id = ${id}
    `.execute(this.db);
    return rows[0] ? toImport(rows[0]) : null;
  }

  async deleteImport(id: FuelImportId): Promise<void> {
    // The purchases go with it (on delete cascade).
    await sql`delete from costing.fuel_imports where id = ${id}`.execute(this.db);
  }
}
