import { sql, type Kysely } from 'kysely';
import type { AuditReader } from '../application/audit-pack.js';
import type {
  CheckResult,
  DefectStatus,
  RawAuditData,
  RepairStatus,
  Severity,
} from '../domain/audit-pack.js';

export type UntypedDb = Kysely<Record<string, unknown>>;

interface CheckRow {
  readonly id: string;
  readonly template_name: string;
  readonly template_version: number;
  readonly driver_id: string;
  readonly check_day: string;
  readonly submitted_at: Date;
  readonly result: CheckResult;
  readonly defect_count: string;
}

interface DefectRow {
  readonly id: string;
  readonly check_id: string;
  readonly driver_id: string;
  readonly label: string;
  readonly severity: Severity;
  readonly detail: string;
  readonly note: string | null;
  readonly status: DefectStatus;
  readonly created_at: Date;
  readonly status_changed_at: Date | null;
  readonly status_changed_by: string | null;
}

interface RepairRow {
  readonly defect_id: string;
  readonly title: string;
  readonly due_date: string;
  readonly status: RepairStatus;
  readonly note: string | null;
  readonly done_on: string | null;
  readonly created_at: Date;
  readonly created_by: string | null;
  readonly completed_at: Date | null;
  readonly completed_by: string | null;
}

interface ItemRow {
  readonly name: string;
  readonly warn_days: number;
  readonly due_date: string;
  readonly last_done: string | null;
}

interface DoneRow {
  readonly item_name: string;
  readonly done_on: string;
  readonly next_due: string;
  readonly note: string | null;
  readonly done_by: string | null;
  readonly recorded_at: Date;
}

/**
 * Reads one vehicle's walk-round checks, defects, repairs and maintenance, for the audit pack. A read-model adapter (AGENTS.md
 * rule 7): it reads the other contexts' tables with SQL and hands back this module's own types. Row-Level Security applies as
 * in the scope the caller runs in, so one company's reader never sees another's rows. Dates leave as text so they are the same
 * day wherever the server runs; a timestamp is placed in a UK day with `Europe/London`.
 */
export class PostgresAuditReader implements AuditReader {
  constructor(private readonly db: UntypedDb) {}

  async collect(
    vehicleId: string,
    range: { readonly from: string; readonly to: string },
  ): Promise<RawAuditData> {
    const checks = await sql<CheckRow>`
      select c.id, c.template_name, c.template_version, c.driver_id,
             to_char(c.check_day, 'YYYY-MM-DD') as check_day, c.submitted_at, c.result,
             (select count(*) from checks.defects d where d.check_id = c.id) as defect_count
      from checks.checks c
      where c.vehicle_id = ${vehicleId} and c.check_day between ${range.from}::date and ${range.to}::date
      order by c.submitted_at, c.id
    `.execute(this.db);

    // Defects found in the range, and any older one still not fixed (it is still the firm's to deal with).
    const defects = await sql<DefectRow>`
      select d.id, d.check_id, c.driver_id, d.label, d.severity, d.detail, d.note, d.status, d.created_at,
             d.status_changed_at, d.status_changed_by
      from checks.defects d
      join checks.checks c on c.id = d.check_id
      where d.vehicle_id = ${vehicleId}
        and (
          (d.created_at at time zone 'Europe/London')::date between ${range.from}::date and ${range.to}::date
          or d.status <> 'fixed'
        )
      order by d.created_at, d.id
    `.execute(this.db);

    const defectIds = defects.rows.map((d) => d.id);
    const repairs =
      defectIds.length === 0
        ? { rows: [] as RepairRow[] }
        : await sql<RepairRow>`
            select defect_id, title, to_char(due_date, 'YYYY-MM-DD') as due_date, status, note,
                   to_char(done_on, 'YYYY-MM-DD') as done_on, created_at, created_by, completed_at, completed_by
            from maintenance.repairs
            where vehicle_id = ${vehicleId} and defect_id in (${sql.join(defectIds)})
            order by created_at, id
          `.execute(this.db);

    const items = await sql<ItemRow>`
      select it.name, it.warn_days, to_char(s.due_date, 'YYYY-MM-DD') as due_date,
             to_char(s.last_done, 'YYYY-MM-DD') as last_done
      from maintenance.schedules s
      join maintenance.item_types it on it.id = s.item_type_id
      where s.vehicle_id = ${vehicleId} and it.archived_at is null
      order by s.due_date, it.name
    `.execute(this.db);

    const done = await sql<DoneRow>`
      select item_name, to_char(done_on, 'YYYY-MM-DD') as done_on, to_char(next_due, 'YYYY-MM-DD') as next_due,
             note, done_by, recorded_at
      from maintenance.history
      where vehicle_id = ${vehicleId} and done_on between ${range.from}::date and ${range.to}::date
      order by done_on, recorded_at, id
    `.execute(this.db);

    return {
      checks: checks.rows.map((r) => ({
        id: r.id,
        templateName: r.template_name,
        templateVersion: r.template_version,
        driverId: r.driver_id,
        checkDay: r.check_day,
        submittedAt: r.submitted_at,
        result: r.result,
        defectCount: Number(r.defect_count),
      })),
      defects: defects.rows.map((r) => ({
        id: r.id,
        checkId: r.check_id,
        foundByDriverId: r.driver_id,
        label: r.label,
        severity: r.severity,
        detail: r.detail,
        note: r.note ?? undefined,
        status: r.status,
        createdAt: r.created_at,
        statusChangedAt: r.status_changed_at ?? undefined,
        statusChangedBy: r.status_changed_by ?? undefined,
      })),
      repairs: repairs.rows.map((r) => ({
        defectId: r.defect_id,
        title: r.title,
        dueDate: r.due_date,
        status: r.status,
        note: r.note ?? undefined,
        doneOn: r.done_on ?? undefined,
        createdAt: r.created_at,
        createdBy: r.created_by ?? undefined,
        completedAt: r.completed_at ?? undefined,
        completedBy: r.completed_by ?? undefined,
      })),
      items: items.rows.map((r) => ({
        name: r.name,
        warnDays: r.warn_days,
        dueDate: r.due_date,
        lastDone: r.last_done ?? undefined,
      })),
      done: done.rows.map((r) => ({
        itemName: r.item_name,
        doneOn: r.done_on,
        nextDue: r.next_due,
        note: r.note ?? undefined,
        doneBy: r.done_by ?? undefined,
        recordedAt: r.recorded_at,
      })),
    };
  }
}
