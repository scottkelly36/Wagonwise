import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { RepairRepository } from '../application/ports/repairs.js';
import type { CompanyId, DayString, StaffId } from '../domain/maintenance.js';
import type { DefectId, Repair, RepairId, RepairStatus, Severity } from '../domain/repair.js';
import type { UntypedDb } from './db.js';

interface Row {
  readonly id: string;
  readonly company_id: string;
  readonly defect_id: string;
  readonly vehicle_id: string;
  readonly vehicle_name: string;
  readonly title: string;
  readonly severity: Severity;
  readonly due_date: string;
  readonly status: RepairStatus;
  readonly note: string | null;
  readonly done_on: string | null;
  readonly created_at: Date;
  readonly created_by: string | null;
  readonly completed_at: Date | null;
  readonly completed_by: string | null;
}

// Days are read back as text, never as a JS Date that a time zone could shift by a day.
const COLUMNS = `id, company_id, defect_id, vehicle_id, vehicle_name, title, severity,
  to_char(due_date, 'YYYY-MM-DD') as due_date, status, note, to_char(done_on, 'YYYY-MM-DD') as done_on,
  created_at, created_by, completed_at, completed_by`;

const toRepair = (row: Row): Repair => ({
  id: makeId<'RepairId'>(row.id),
  companyId: makeId<'CompanyId'>(row.company_id),
  defectId: row.defect_id,
  vehicleId: makeId<'FleetVehicleId'>(row.vehicle_id),
  vehicleName: row.vehicle_name,
  title: row.title,
  severity: row.severity,
  dueDate: row.due_date,
  status: row.status,
  note: row.note ?? undefined,
  doneOn: row.done_on ?? undefined,
  createdAt: row.created_at,
  createdBy: row.created_by === null ? undefined : makeId<'StaffId'>(row.created_by),
  completedAt: row.completed_at ?? undefined,
  completedBy: row.completed_by === null ? undefined : makeId<'StaffId'>(row.completed_by),
});

/** Raw `sql` like every other repository here (decision 26). Row-Level Security (migration 0052) limits a request to
 *  its own company's rows. */
export class PostgresRepairRepository implements RepairRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: RepairId): Promise<Repair | null> {
    const { rows } = await sql<Row>`
      select ${sql.raw(COLUMNS)} from maintenance.repairs where id = ${id}
    `.execute(this.db);
    return rows[0] ? toRepair(rows[0]) : null;
  }

  async findOpenForDefect(defectId: DefectId): Promise<Repair | null> {
    const { rows } = await sql<Row>`
      select ${sql.raw(COLUMNS)} from maintenance.repairs
      where defect_id = ${defectId} and status = 'open'
    `.execute(this.db);
    return rows[0] ? toRepair(rows[0]) : null;
  }

  async list(companyId: CompanyId, status: 'open' | 'done' | 'all'): Promise<Repair[]> {
    const { rows } = await sql<Row>`
      select ${sql.raw(COLUMNS)} from maintenance.repairs
      where company_id = ${companyId}
        and (${status} = 'all' or status = ${status})
      order by due_date, created_at
    `.execute(this.db);
    return rows.map(toRepair);
  }

  async insert(repair: Repair): Promise<void> {
    await sql`
      insert into maintenance.repairs
        (id, company_id, defect_id, vehicle_id, vehicle_name, title, severity, due_date, status, note,
         created_at, created_by)
      values (${repair.id}, ${repair.companyId}, ${repair.defectId}, ${repair.vehicleId}, ${repair.vehicleName},
              ${repair.title}, ${repair.severity}, ${repair.dueDate}::date, ${repair.status}, ${repair.note ?? null},
              ${repair.createdAt}, ${repair.createdBy ?? null})
    `.execute(this.db);
  }

  async complete(
    id: RepairId,
    doneOn: DayString,
    note: string | undefined,
    by: StaffId,
    at: Date,
  ): Promise<void> {
    await sql`
      update maintenance.repairs set status = 'done', done_on = ${doneOn}::date,
        note = coalesce(${note ?? null}, note), completed_by = ${by}, completed_at = ${at}
      where id = ${id} and status = 'open'
    `.execute(this.db);
  }

  async cancel(id: RepairId, by: StaffId, at: Date): Promise<void> {
    await sql`
      update maintenance.repairs set status = 'cancelled', completed_by = ${by}, completed_at = ${at}
      where id = ${id} and status = 'open'
    `.execute(this.db);
  }
}
