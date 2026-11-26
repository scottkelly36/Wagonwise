import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { FileRepository, SettingsRepository } from '../application/ports.js';
import {
  DEFAULT_SETTINGS,
  type CompanyId,
  type DriverId,
  type FileKind,
  type FileSource,
  type FileSummary,
  type FirmSettings,
  type NewFile,
  type StaffId,
  type StoredFile,
} from '../domain/tachograph.js';
import type { UntypedDb } from './db.js';

/** Raw `sql` like every repository here (decision 26). Row-Level Security (migration 0109) limits a request to its own company's
 *  rows, and a driver to their own card files. */
export class PostgresSettingsRepository implements SettingsRepository {
  constructor(private readonly db: UntypedDb) {}

  async get(companyId: CompanyId): Promise<FirmSettings> {
    const { rows } = await sql<{
      drivers_may_send: boolean;
      retention_months: number;
      reminders_enabled: boolean;
    }>`
      select drivers_may_send, retention_months, reminders_enabled from tachograph.settings where company_id = ${companyId}
    `.execute(this.db);
    const row = rows[0];
    return row === undefined
      ? DEFAULT_SETTINGS
      : {
          driversMaySend: row.drivers_may_send,
          retentionMonths: row.retention_months,
          remindersEnabled: row.reminders_enabled,
        };
  }

  async set(companyId: CompanyId, settings: FirmSettings, by: StaffId, at: Date): Promise<void> {
    await sql`
      insert into tachograph.settings (company_id, drivers_may_send, retention_months, reminders_enabled, updated_at, updated_by)
      values (${companyId}, ${settings.driversMaySend}, ${settings.retentionMonths}, ${settings.remindersEnabled}, ${at}, ${by})
      on conflict (company_id) do update
        set drivers_may_send = excluded.drivers_may_send, retention_months = excluded.retention_months, reminders_enabled = excluded.reminders_enabled,
            updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `.execute(this.db);
  }
}

interface SummaryRow {
  readonly id: string;
  readonly company_id: string;
  readonly kind: FileKind;
  readonly driver_id: string | null;
  readonly vehicle_id: string | null;
  readonly file_name: string;
  readonly size_bytes: number;
  readonly downloaded_on: string;
  readonly uploaded_at: Date;
  readonly from_driver: boolean;
}

/** Everything but the bytes. `downloaded_on` is cast to text so it stays the plain date the uploader gave. */
const SUMMARY_COLUMNS = sql`
  id, company_id, kind, driver_id, vehicle_id, file_name, size_bytes, downloaded_on::text as downloaded_on,
  uploaded_at, (uploaded_by_driver_id is not null) as from_driver
`;

function toSummary(row: SummaryRow): FileSummary {
  const source: FileSource = row.from_driver ? 'driver_app' : 'office';
  return {
    id: row.id,
    companyId: makeId<'CompanyId'>(row.company_id),
    kind: row.kind,
    driverId: row.driver_id ?? undefined,
    vehicleId: row.vehicle_id ?? undefined,
    fileName: row.file_name,
    sizeBytes: row.size_bytes,
    downloadedOn: row.downloaded_on,
    receivedAt: row.uploaded_at,
    source,
  };
}

export class PostgresFileRepository implements FileRepository {
  constructor(private readonly db: UntypedDb) {}

  async add(file: NewFile): Promise<'added' | 'duplicate'> {
    // The same bytes are kept once for a company: the unique (company_id, sha256) turns a second copy into no change.
    const { rows } = await sql<{ id: string }>`
      insert into tachograph.files (id, company_id, kind, driver_id, vehicle_id, file_name, size_bytes, sha256, data,
                                    downloaded_on, uploaded_at, uploaded_by_driver_id, uploaded_by_staff_id, wording_version)
      values (${file.id}, ${file.companyId}, ${file.kind}, ${file.driverId ?? null}, ${file.vehicleId ?? null},
              ${file.fileName}, ${file.data.length}, ${file.sha256}, ${file.data}, ${file.downloadedOn}::date,
              ${file.receivedAt}, ${file.uploadedByDriverId ?? null}, ${file.uploadedByStaffId ?? null},
              ${file.wordingVersion ?? null})
      on conflict (company_id, sha256) do nothing
      returning id
    `.execute(this.db);
    return rows.length > 0 ? 'added' : 'duplicate';
  }

  async latestPerSubject(companyId: CompanyId): Promise<FileSummary[]> {
    const { rows } = await sql<SummaryRow>`
      select distinct on (kind, coalesce(driver_id, vehicle_id)) ${SUMMARY_COLUMNS}
      from tachograph.files
      where company_id = ${companyId}
      order by kind, coalesce(driver_id, vehicle_id), downloaded_on desc, uploaded_at desc
    `.execute(this.db);
    return rows.map(toSummary);
  }

  async recent(companyId: CompanyId, limit: number): Promise<FileSummary[]> {
    const { rows } = await sql<SummaryRow>`
      select ${SUMMARY_COLUMNS} from tachograph.files
      where company_id = ${companyId}
      order by uploaded_at desc
      limit ${limit}
    `.execute(this.db);
    return rows.map(toSummary);
  }

  async find(companyId: CompanyId, fileId: string): Promise<StoredFile | null> {
    const { rows } = await sql<SummaryRow & { data: Buffer; sha256: string }>`
      select ${SUMMARY_COLUMNS}, data, sha256 from tachograph.files
      where company_id = ${companyId} and id = ${fileId}
    `.execute(this.db);
    const row = rows[0];
    return row === undefined
      ? null
      : { summary: toSummary(row), data: Buffer.from(row.data), sha256: row.sha256 };
  }

  async remove(companyId: CompanyId, fileId: string): Promise<boolean> {
    const { rows } = await sql`
      delete from tachograph.files where company_id = ${companyId} and id = ${fileId} returning id
    `.execute(this.db);
    return rows.length > 0;
  }

  async latestCardDay(companyId: CompanyId, driverId: DriverId): Promise<string | undefined> {
    const { rows } = await sql<{ day: string | null }>`
      select max(downloaded_on)::text as day from tachograph.files
      where company_id = ${companyId} and driver_id = ${driverId} and kind = 'driver_card'
    `.execute(this.db);
    return rows[0]?.day ?? undefined;
  }

  async deleteExpired(now: Date): Promise<number> {
    // Kept for the firm's retention (12 months unless it chose longer) from the day it was received. Platform scope sees every
    // company's files.
    const { rows } = await sql`
      delete from tachograph.files f
      where f.uploaded_at < ${now}::timestamptz - make_interval(
        months => coalesce((select s.retention_months from tachograph.settings s where s.company_id = f.company_id), 12)
      )
      returning f.id
    `.execute(this.db);
    return rows.length;
  }
}
