import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { SosRepository } from '../application/ports.js';
import type {
  CompanyId,
  DriverId,
  SosAlert,
  SosAlertId,
  SosStatus,
  StaffId,
} from '../domain/sos.js';
import type { UntypedDb } from './db.js';

interface AlertRow {
  readonly id: string;
  readonly request_id: string;
  readonly company_id: string;
  readonly driver_id: string;
  readonly driver_name: string | null;
  readonly driver_contact: string | null;
  readonly vehicle_name: string | null;
  readonly vehicle_registration: string | null;
  readonly job_reference: string | null;
  readonly lat: number;
  readonly lon: number;
  readonly words: string | null;
  readonly nearest_place: string | null;
  readonly status: SosStatus;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly resolved_by: string | null;
  readonly resolved_at: Date | null;
}

const SELECT_COLUMNS = `
  id, request_id, company_id, driver_id, driver_name, driver_contact, vehicle_name, vehicle_registration,
  job_reference, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lon, words, nearest_place,
  status, created_at, updated_at, resolved_by, resolved_at
`;

function toDomain(row: AlertRow): SosAlert {
  return {
    id: makeId<'SosAlertId'>(row.id),
    requestId: row.request_id,
    companyId: makeId<'CompanyId'>(row.company_id),
    driverId: makeId<'DriverId'>(row.driver_id),
    driverName: row.driver_name ?? undefined,
    driverContact: row.driver_contact ?? undefined,
    vehicleName: row.vehicle_name ?? undefined,
    vehicleRegistration: row.vehicle_registration ?? undefined,
    jobReference: row.job_reference ?? undefined,
    location: { lat: row.lat, lon: row.lon },
    words: row.words ?? undefined,
    nearestPlace: row.nearest_place ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedBy: row.resolved_by === null ? undefined : makeId<'StaffId'>(row.resolved_by),
    resolvedAt: row.resolved_at ?? undefined,
  };
}

/** Raw `sql` like every other repository here. Row-Level Security (migration 0077) does the company and driver filtering as well. */
export class PostgresSosRepository implements SosRepository {
  constructor(private readonly db: UntypedDb) {}

  async insertAll(alerts: readonly SosAlert[]): Promise<void> {
    for (const a of alerts) {
      await sql`
        insert into sos.alerts
          (id, request_id, company_id, driver_id, driver_name, driver_contact, vehicle_name, vehicle_registration,
           job_reference, location, words, nearest_place, status, created_at, updated_at)
        values (
          ${a.id}, ${a.requestId}, ${a.companyId}, ${a.driverId}, ${a.driverName ?? null}, ${a.driverContact ?? null},
          ${a.vehicleName ?? null}, ${a.vehicleRegistration ?? null}, ${a.jobReference ?? null},
          ST_SetSRID(ST_MakePoint(${a.location.lon}, ${a.location.lat}), 4326)::geography,
          ${a.words ?? null}, ${a.nearestPlace ?? null}, ${a.status}, ${a.createdAt}, ${a.updatedAt}
        )
        on conflict (request_id, company_id) do nothing
      `.execute(this.db);
    }
  }

  async findByRequest(requestId: string, driverId: DriverId): Promise<SosAlert[]> {
    const { rows } = await sql<AlertRow>`
      select ${sql.raw(SELECT_COLUMNS)} from sos.alerts
      where request_id = ${requestId} and driver_id = ${driverId} order by created_at
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async listForCompany(
    companyId: CompanyId,
    status: 'open' | 'all',
    limit: number,
  ): Promise<SosAlert[]> {
    const { rows } = await sql<AlertRow>`
      select ${sql.raw(SELECT_COLUMNS)} from sos.alerts
      where company_id = ${companyId} and (${status === 'all'} or status = 'open')
      order by created_at desc limit ${limit}
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async findById(id: SosAlertId): Promise<SosAlert | null> {
    const { rows } = await sql<AlertRow>`
      select ${sql.raw(SELECT_COLUMNS)} from sos.alerts where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async resolve(id: SosAlertId, by: StaffId, at: Date): Promise<void> {
    await sql`
      update sos.alerts set status = 'resolved', resolved_by = ${by}, resolved_at = ${at}, updated_at = ${at}
      where id = ${id} and status = 'open'
    `.execute(this.db);
  }

  async cancelRequest(requestId: string, driverId: DriverId, at: Date): Promise<SosAlert[]> {
    const { rows } = await sql<AlertRow>`
      update sos.alerts set status = 'cancelled', updated_at = ${at}
      where request_id = ${requestId} and driver_id = ${driverId} and status = 'open'
      returning ${sql.raw(SELECT_COLUMNS)}
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async deleteClosedBefore(cutoff: Date): Promise<number> {
    const result = await sql`
      delete from sos.alerts where status <> 'open' and updated_at < ${cutoff}
    `.execute(this.db);
    return Number(result.numAffectedRows ?? 0);
  }

  async eraseDriver(driverId: DriverId): Promise<void> {
    await sql`delete from sos.alerts where driver_id = ${driverId}`.execute(this.db);
  }
}
