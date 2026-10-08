import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { CheckPhoto, CheckRepository } from '../application/ports/check-repository.js';
import type { CheckItem, CheckTemplateId, CompanyId, VehicleId } from '../domain/check-template.js';
import type { Answer, Check, CheckId, CheckResult, Defect } from '../domain/check.js';
import type { UntypedDb } from './db.js';

interface CheckRow {
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
  readonly item_id: string;
  readonly label: string;
  readonly severity: Defect['severity'];
  readonly detail: string;
  readonly note: string | null;
}

// The day is read back as text, never as a JS Date that a time zone could shift by a day.
const COLUMNS = `id, company_id, template_id, template_version, template_name, vehicle_id, vehicle_name,
  driver_id, to_char(check_day, 'YYYY-MM-DD') as check_day, items, answers, result, submitted_at,
  device_completed_at`;

/** Raw `sql` like every other repository here (decision 26). Row-Level Security (migration 0044) decides which
 *  checks a request may see; the application's own checks come first. */
export class PostgresCheckRepository implements CheckRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: CheckId): Promise<Check | null> {
    const { rows } = await sql<CheckRow>`
      select ${sql.raw(COLUMNS)} from checks.checks where id = ${id}
    `.execute(this.db);
    const row = rows[0];
    if (!row) return null;
    const { rows: defects } = await sql<DefectRow>`
      select item_id, label, severity, detail, note from checks.defects
      where check_id = ${id} order by created_at, item_id
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
      defects: defects.map((d): Defect => ({
        itemId: d.item_id,
        label: d.label,
        severity: d.severity,
        detail: d.detail,
        note: d.note ?? undefined,
      })),
      submittedAt: row.submitted_at,
      deviceCompletedAt: row.device_completed_at ?? undefined,
    };
  }

  async doneOnDay(
    templateId: CheckTemplateId,
    vehicleId: VehicleId,
    day: string,
  ): Promise<boolean> {
    const { rows } = await sql<{ found: number }>`
      select 1 as found from checks.checks
      where template_id = ${templateId} and vehicle_id = ${vehicleId} and check_day = ${day}::date
      limit 1
    `.execute(this.db);
    return rows.length > 0;
  }

  async save(check: Check, defectIds: readonly string[]): Promise<void> {
    await sql`
      insert into checks.checks
        (id, company_id, template_id, template_version, template_name, vehicle_id, vehicle_name, driver_id,
         check_day, items, answers, result, submitted_at, device_completed_at)
      values (${check.id}, ${check.companyId}, ${check.templateId}, ${check.templateVersion},
              ${check.templateName}, ${check.vehicleId}, ${check.vehicleName}, ${check.driverId},
              ${check.checkDay}::date, ${JSON.stringify(check.items)}::jsonb,
              ${JSON.stringify(check.answers)}::jsonb, ${check.result}, ${check.submittedAt},
              ${check.deviceCompletedAt ?? null})
    `.execute(this.db);
    for (const [index, defect] of check.defects.entries()) {
      await sql`
        insert into checks.defects
          (id, check_id, company_id, vehicle_id, vehicle_name, item_id, label, severity, detail, note, created_at)
        values (${defectIds[index]}, ${check.id}, ${check.companyId}, ${check.vehicleId},
                ${check.vehicleName}, ${defect.itemId}, ${defect.label}, ${defect.severity},
                ${defect.detail}, ${defect.note ?? null}, ${check.submittedAt})
      `.execute(this.db);
    }
  }

  async deleteOlderThan(companyId: CompanyId, cutoff: Date): Promise<number> {
    // The photos and defects go with the check (on delete cascade). A check that still has a defect open or only
    // seen stays: an unresolved fault must not be lost to the clock.
    const { rows } = await sql<{ id: string }>`
      delete from checks.checks c
      where c.company_id = ${companyId} and c.submitted_at < ${cutoff}
        and not exists (
          select 1 from checks.defects d where d.check_id = c.id and d.status <> 'fixed'
        )
      returning c.id
    `.execute(this.db);
    return rows.length;
  }

  async savePhoto(check: Check, itemId: string, photo: CheckPhoto, at: Date): Promise<void> {
    await sql`
      insert into checks.check_photos (check_id, item_id, company_id, content_type, data, captured_at)
      values (${check.id}, ${itemId}, ${check.companyId}, ${photo.contentType},
              decode(${photo.dataBase64}, 'base64'), ${at})
      on conflict (check_id, item_id) do update set
        content_type = excluded.content_type, data = excluded.data, captured_at = excluded.captured_at
    `.execute(this.db);
  }
}
