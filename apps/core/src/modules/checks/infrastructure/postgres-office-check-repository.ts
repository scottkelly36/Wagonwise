import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type {
  OfficeCheckRepository,
  StoredCheckPhoto,
} from '../application/ports/office-check-repository.js';
import type { CheckItem, CompanyId, StaffId } from '../domain/check-template.js';
import type { Answer, CheckId, CheckResult } from '../domain/check.js';
import type {
  CheckDetail,
  CheckSummary,
  DefectId,
  DefectRecord,
  DefectStatus,
} from '../domain/office.js';
import type { UntypedDb } from './db.js';

interface SummaryRow {
  readonly id: string;
  readonly company_id: string;
  readonly template_id: string;
  readonly template_name: string;
  readonly vehicle_id: string;
  readonly vehicle_name: string;
  readonly driver_id: string;
  readonly check_day: string;
  readonly submitted_at: Date;
  readonly result: CheckResult;
  readonly defect_count: number;
}

interface DetailRow {
  readonly id: string;
  readonly company_id: string;
  readonly template_id: string;
  readonly template_version: number;
  readonly template_name: string;
  readonly vehicle_id: string;
  readonly vehicle_name: string;
  readonly driver_id: string;
  readonly check_day: string;
  readonly items: CheckItem[];
  readonly answers: Answer[];
  readonly result: CheckResult;
  readonly submitted_at: Date;
  readonly device_completed_at: Date | null;
}

interface DefectRow {
  readonly id: string;
  readonly check_id: string;
  readonly company_id: string;
  readonly vehicle_id: string;
  readonly vehicle_name: string;
  readonly item_id: string;
  readonly label: string;
  readonly severity: DefectRecord['severity'];
  readonly detail: string;
  readonly note: string | null;
  readonly status: DefectStatus;
  readonly created_at: Date;
  readonly status_changed_at: Date | null;
  readonly status_changed_by: string | null;
}

const DEFECT_COLUMNS = `id, check_id, company_id, vehicle_id, vehicle_name, item_id, label, severity, detail,
  note, status, created_at, status_changed_at, status_changed_by`;

const toDefect = (row: DefectRow): DefectRecord => ({
  id: row.id,
  checkId: makeId<'CheckId'>(row.check_id),
  companyId: makeId<'CompanyId'>(row.company_id),
  vehicleId: makeId<'FleetVehicleId'>(row.vehicle_id),
  vehicleName: row.vehicle_name,
  itemId: row.item_id,
  label: row.label,
  severity: row.severity,
  detail: row.detail,
  note: row.note ?? undefined,
  status: row.status,
  createdAt: row.created_at,
  statusChangedAt: row.status_changed_at ?? undefined,
  statusChangedBy:
    row.status_changed_by === null ? undefined : makeId<'StaffId'>(row.status_changed_by),
});

/** Raw `sql` like every other repository here (decision 26). Row-Level Security (migration 0044) limits a request
 *  to its own company's rows; the application's permission checks come first. */
export class PostgresOfficeCheckRepository implements OfficeCheckRepository {
  constructor(private readonly db: UntypedDb) {}

  async listSummaries(
    companyId: CompanyId,
    fromDay: string,
    toDay: string,
  ): Promise<CheckSummary[]> {
    const { rows } = await sql<SummaryRow>`
      select c.id, c.company_id, c.template_id, c.template_name, c.vehicle_id, c.vehicle_name, c.driver_id,
             to_char(c.check_day, 'YYYY-MM-DD') as check_day, c.submitted_at, c.result,
             (select count(*)::int from checks.defects d where d.check_id = c.id) as defect_count
      from checks.checks c
      where c.company_id = ${companyId}
        and c.check_day between ${fromDay}::date and ${toDay}::date
      order by c.submitted_at desc
    `.execute(this.db);
    return rows.map((r): CheckSummary => ({
      id: makeId<'CheckId'>(r.id),
      companyId: makeId<'CompanyId'>(r.company_id),
      templateId: makeId<'CheckTemplateId'>(r.template_id),
      templateName: r.template_name,
      vehicleId: makeId<'FleetVehicleId'>(r.vehicle_id),
      vehicleName: r.vehicle_name,
      driverId: makeId<'DriverId'>(r.driver_id),
      checkDay: r.check_day,
      submittedAt: r.submitted_at,
      result: r.result,
      defectCount: r.defect_count,
    }));
  }

  async findDetail(id: CheckId): Promise<CheckDetail | null> {
    const { rows } = await sql<DetailRow>`
      select id, company_id, template_id, template_version, template_name, vehicle_id, vehicle_name, driver_id,
             to_char(check_day, 'YYYY-MM-DD') as check_day, items, answers, result, submitted_at,
             device_completed_at
      from checks.checks where id = ${id}
    `.execute(this.db);
    const row = rows[0];
    if (!row) return null;
    const { rows: defects } = await sql<DefectRow>`
      select ${sql.raw(DEFECT_COLUMNS)} from checks.defects where check_id = ${id}
      order by created_at, item_id
    `.execute(this.db);
    const { rows: photos } = await sql<{ item_id: string }>`
      select item_id from checks.check_photos where check_id = ${id} order by item_id
    `.execute(this.db);
    return {
      id: makeId<'CheckId'>(row.id),
      companyId: makeId<'CompanyId'>(row.company_id),
      templateId: makeId<'CheckTemplateId'>(row.template_id),
      templateVersion: row.template_version,
      templateName: row.template_name,
      vehicleId: makeId<'FleetVehicleId'>(row.vehicle_id),
      vehicleName: row.vehicle_name,
      driverId: makeId<'DriverId'>(row.driver_id),
      checkDay: row.check_day,
      items: row.items,
      answers: row.answers,
      result: row.result,
      defects: defects.map(toDefect),
      photoItemIds: photos.map((p) => p.item_id),
      submittedAt: row.submitted_at,
      deviceCompletedAt: row.device_completed_at ?? undefined,
    };
  }

  async findPhoto(checkId: CheckId, itemId: string): Promise<StoredCheckPhoto | null> {
    const { rows } = await sql<{ content_type: string; data_base64: string; captured_at: Date }>`
      select content_type, encode(data, 'base64') as data_base64, captured_at
      from checks.check_photos where check_id = ${checkId} and item_id = ${itemId}
    `.execute(this.db);
    const row = rows[0];
    return row
      ? {
          contentType: row.content_type,
          // Postgres wraps base64 at 76 characters; the wire format is one unbroken string.
          dataBase64: row.data_base64.replace(/\s/g, ''),
          capturedAt: row.captured_at,
        }
      : null;
  }

  async listDefects(
    companyId: CompanyId,
    statuses: readonly DefectStatus[],
  ): Promise<DefectRecord[]> {
    if (statuses.length === 0) return [];
    const { rows } = await sql<DefectRow>`
      select ${sql.raw(DEFECT_COLUMNS)} from checks.defects
      where company_id = ${companyId} and status in (${sql.join(statuses)})
      order by case severity when 'do_not_drive' then 0 else 1 end, created_at desc
    `.execute(this.db);
    return rows.map(toDefect);
  }

  async findDefect(id: DefectId): Promise<DefectRecord | null> {
    const { rows } = await sql<DefectRow>`
      select ${sql.raw(DEFECT_COLUMNS)} from checks.defects where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDefect(rows[0]) : null;
  }

  async setDefectStatus(id: DefectId, status: DefectStatus, by: StaffId, at: Date): Promise<void> {
    await sql`
      update checks.defects set status = ${status}, status_changed_at = ${at}, status_changed_by = ${by}
      where id = ${id}
    `.execute(this.db);
  }
}
