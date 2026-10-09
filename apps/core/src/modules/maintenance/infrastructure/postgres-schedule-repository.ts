import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { ScheduleRepository } from '../application/ports/schedule-repository.js';
import type {
  CompanyId,
  HistoryEntry,
  ItemTypeId,
  Schedule,
  StaffId,
  VehicleId,
} from '../domain/maintenance.js';
import type { UntypedDb } from './db.js';

interface ScheduleRow {
  readonly vehicle_id: string;
  readonly item_type_id: string;
  readonly due_date: string;
  readonly last_done: string | null;
}

interface HistoryRow {
  readonly id: string;
  readonly vehicle_id: string;
  readonly item_type_id: string;
  readonly item_name: string;
  readonly done_on: string;
  readonly next_due: string;
  readonly note: string | null;
  readonly done_by: string | null;
  readonly recorded_at: Date;
}

// Days are read back as text, never as a JS Date that a time zone could shift by a day.
const SCHEDULE_COLUMNS = `vehicle_id, item_type_id, to_char(due_date, 'YYYY-MM-DD') as due_date,
  to_char(last_done, 'YYYY-MM-DD') as last_done`;
const HISTORY_COLUMNS = `id, vehicle_id, item_type_id, item_name, to_char(done_on, 'YYYY-MM-DD') as done_on,
  to_char(next_due, 'YYYY-MM-DD') as next_due, note, done_by, recorded_at`;

const toSchedule = (row: ScheduleRow): Schedule => ({
  vehicleId: makeId<'FleetVehicleId'>(row.vehicle_id),
  itemTypeId: makeId<'MaintenanceItemId'>(row.item_type_id),
  dueDate: row.due_date,
  lastDone: row.last_done ?? undefined,
});

const toHistory = (row: HistoryRow): HistoryEntry => ({
  id: row.id,
  vehicleId: makeId<'FleetVehicleId'>(row.vehicle_id),
  itemTypeId: makeId<'MaintenanceItemId'>(row.item_type_id),
  itemName: row.item_name,
  doneOn: row.done_on,
  nextDue: row.next_due,
  note: row.note ?? undefined,
  doneBy: row.done_by === null ? undefined : makeId<'StaffId'>(row.done_by),
  recordedAt: row.recorded_at,
});

/** Raw `sql` like every other repository here (decision 26). Row-Level Security (migration 0050) limits a request
 *  to its own company's rows. */
export class PostgresScheduleRepository implements ScheduleRepository {
  constructor(private readonly db: UntypedDb) {}

  async listForCompany(companyId: CompanyId): Promise<Schedule[]> {
    const { rows } = await sql<ScheduleRow>`
      select ${sql.raw(SCHEDULE_COLUMNS)} from maintenance.schedules where company_id = ${companyId}
    `.execute(this.db);
    return rows.map(toSchedule);
  }

  async listForVehicle(vehicleId: VehicleId): Promise<Schedule[]> {
    const { rows } = await sql<ScheduleRow>`
      select ${sql.raw(SCHEDULE_COLUMNS)} from maintenance.schedules where vehicle_id = ${vehicleId}
    `.execute(this.db);
    return rows.map(toSchedule);
  }

  async find(vehicleId: VehicleId, itemTypeId: ItemTypeId): Promise<Schedule | null> {
    const { rows } = await sql<ScheduleRow>`
      select ${sql.raw(SCHEDULE_COLUMNS)} from maintenance.schedules
      where vehicle_id = ${vehicleId} and item_type_id = ${itemTypeId}
    `.execute(this.db);
    return rows[0] ? toSchedule(rows[0]) : null;
  }

  async upsert(companyId: CompanyId, schedule: Schedule, by: StaffId, at: Date): Promise<void> {
    await sql`
      insert into maintenance.schedules
        (vehicle_id, item_type_id, company_id, due_date, last_done, updated_at, updated_by)
      values (${schedule.vehicleId}, ${schedule.itemTypeId}, ${companyId}, ${schedule.dueDate}::date,
              ${schedule.lastDone ?? null}::date, ${at}, ${by})
      on conflict (vehicle_id, item_type_id) do update set
        due_date = excluded.due_date, last_done = excluded.last_done,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `.execute(this.db);
  }

  async addHistory(companyId: CompanyId, entry: HistoryEntry): Promise<void> {
    await sql`
      insert into maintenance.history
        (id, vehicle_id, item_type_id, company_id, item_name, done_on, next_due, note, done_by, recorded_at)
      values (${entry.id}, ${entry.vehicleId}, ${entry.itemTypeId}, ${companyId}, ${entry.itemName},
              ${entry.doneOn}::date, ${entry.nextDue}::date, ${entry.note ?? null}, ${entry.doneBy ?? null},
              ${entry.recordedAt})
    `.execute(this.db);
  }

  async listHistory(vehicleId: VehicleId): Promise<HistoryEntry[]> {
    const { rows } = await sql<HistoryRow>`
      select ${sql.raw(HISTORY_COLUMNS)} from maintenance.history
      where vehicle_id = ${vehicleId} order by done_on desc, recorded_at desc
    `.execute(this.db);
    return rows.map(toHistory);
  }
}
