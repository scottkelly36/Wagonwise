import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type {
  SettingsRepository,
  SharingRepository,
  StatusRepository,
} from '../application/ports.js';
import type { CompanyId, DriverId, HoursStatus, StaffId } from '../domain/hours.js';
import type { UntypedDb } from './db.js';

/** Raw `sql` like every repository here (decision 26). Row-Level Security (migration 0054) limits a request to its own
 *  company's rows, or a driver's own. */
export class PostgresSettingsRepository implements SettingsRepository {
  constructor(private readonly db: UntypedDb) {}

  async isEnabled(companyId: CompanyId): Promise<boolean> {
    const { rows } = await sql<{ enabled: boolean }>`
      select enabled from hours.settings where company_id = ${companyId}
    `.execute(this.db);
    return rows[0]?.enabled ?? false;
  }

  async set(companyId: CompanyId, enabled: boolean, by: StaffId, at: Date): Promise<void> {
    await sql`
      insert into hours.settings (company_id, enabled, updated_at, updated_by)
      values (${companyId}, ${enabled}, ${at}, ${by})
      on conflict (company_id) do update
        set enabled = excluded.enabled, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `.execute(this.db);
  }
}

export class PostgresSharingRepository implements SharingRepository {
  constructor(private readonly db: UntypedDb) {}

  /** A deleted driver's choices go with them (every company). */
  async eraseDriver(driverId: DriverId): Promise<void> {
    await sql`delete from hours.sharing where driver_id = ${driverId}`.execute(this.db);
  }

  async isSharing(companyId: CompanyId, driverId: DriverId): Promise<boolean> {
    const { rows } = await sql`
      select 1 from hours.sharing where company_id = ${companyId} and driver_id = ${driverId}
    `.execute(this.db);
    return rows.length > 0;
  }

  async set(
    companyId: CompanyId,
    driverId: DriverId,
    sharing: boolean,
    wordingVersion: number,
    at: Date,
  ): Promise<void> {
    if (sharing) {
      await sql`
        insert into hours.sharing (company_id, driver_id, consented_at, wording_version)
        values (${companyId}, ${driverId}, ${at}, ${wordingVersion})
        on conflict (company_id, driver_id) do nothing
      `.execute(this.db);
    } else {
      await sql`
        delete from hours.sharing where company_id = ${companyId} and driver_id = ${driverId}
      `.execute(this.db);
    }
  }
}

interface StatusRow {
  readonly company_id: string;
  readonly driver_id: string;
  readonly state: HoursStatus['state'];
  readonly driving_left_min: number;
  readonly next: HoursStatus['next'];
  readonly updated_at: Date;
}

export class PostgresStatusRepository implements StatusRepository {
  constructor(private readonly db: UntypedDb) {}

  async upsert(status: HoursStatus): Promise<void> {
    await sql`
      insert into hours.status (company_id, driver_id, state, driving_left_min, next, updated_at)
      values (${status.companyId}, ${status.driverId}, ${status.state}, ${status.drivingLeftMin},
              ${status.next}, ${status.updatedAt})
      on conflict (company_id, driver_id) do update
        set state = excluded.state, driving_left_min = excluded.driving_left_min,
            next = excluded.next, updated_at = excluded.updated_at
    `.execute(this.db);
  }

  async listForCompany(companyId: CompanyId): Promise<HoursStatus[]> {
    const { rows } = await sql<StatusRow>`
      select company_id, driver_id, state, driving_left_min, next, updated_at
      from hours.status where company_id = ${companyId} order by updated_at desc
    `.execute(this.db);
    return rows.map((r) => ({
      companyId: makeId<'CompanyId'>(r.company_id),
      driverId: makeId<'DriverId'>(r.driver_id),
      state: r.state,
      drivingLeftMin: r.driving_left_min,
      next: r.next,
      updatedAt: r.updated_at,
    }));
  }

  async remove(driverId: DriverId, companyId?: CompanyId): Promise<void> {
    if (companyId === undefined) {
      await sql`delete from hours.status where driver_id = ${driverId}`.execute(this.db);
    } else {
      await sql`
        delete from hours.status where driver_id = ${driverId} and company_id = ${companyId}
      `.execute(this.db);
    }
  }

  async removeAllForCompany(companyId: CompanyId): Promise<void> {
    await sql`delete from hours.status where company_id = ${companyId}`.execute(this.db);
  }

  async deleteStale(before: Date): Promise<number> {
    const result = await sql`delete from hours.status where updated_at < ${before}`.execute(
      this.db,
    );
    return Number(result.numAffectedRows ?? 0);
  }
}
