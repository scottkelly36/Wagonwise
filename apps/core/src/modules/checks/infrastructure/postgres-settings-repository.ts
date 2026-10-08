import { sql } from 'kysely';
import type { SettingsRepository } from '../application/ports/settings-repository.js';
import type { CompanyId, StaffId } from '../domain/check-template.js';
import { DEFAULT_SETTINGS, type CheckSettings } from '../domain/settings.js';
import type { UntypedDb } from './db.js';

/** Raw `sql` like every other repository here (decision 26). A company with no row has the defaults, both off. */
export class PostgresSettingsRepository implements SettingsRepository {
  constructor(private readonly db: UntypedDb) {}

  async get(companyId: CompanyId): Promise<CheckSettings> {
    const { rows } = await sql<{ required_before_job: boolean; block_on_do_not_drive: boolean }>`
      select required_before_job, block_on_do_not_drive from checks.settings
      where company_id = ${companyId}
    `.execute(this.db);
    const row = rows[0];
    return row
      ? { requiredBeforeJob: row.required_before_job, blockOnDoNotDrive: row.block_on_do_not_drive }
      : DEFAULT_SETTINGS;
  }

  async save(companyId: CompanyId, settings: CheckSettings, by: StaffId, at: Date): Promise<void> {
    await sql`
      insert into checks.settings
        (company_id, required_before_job, block_on_do_not_drive, updated_at, updated_by)
      values (${companyId}, ${settings.requiredBeforeJob}, ${settings.blockOnDoNotDrive}, ${at}, ${by})
      on conflict (company_id) do update set
        required_before_job = excluded.required_before_job,
        block_on_do_not_drive = excluded.block_on_do_not_drive,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `.execute(this.db);
  }
}
