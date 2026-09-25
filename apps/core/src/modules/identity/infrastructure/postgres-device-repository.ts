import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { DeviceRepository } from '../application/ports/device-repository.js';
import type { Device } from '../domain/device.js';
import type { DriverId } from '../domain/driver.js';
import type { UntypedDb } from './db.js';

interface DeviceRow {
  readonly id: string;
  readonly driver_id: string;
  readonly push_token: string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

function toDomain(row: DeviceRow): Device {
  return {
    id: makeId<'DeviceId'>(row.id),
    driverId: makeId<'DriverId'>(row.driver_id),
    pushToken: row.push_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresDeviceRepository implements DeviceRepository {
  constructor(private readonly db: UntypedDb) {}

  async findByPushToken(pushToken: string): Promise<Device | null> {
    const { rows } = await sql<DeviceRow>`
      select id, driver_id, push_token, created_at, updated_at
      from identity.devices where push_token = ${pushToken}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByDriverId(driverId: DriverId): Promise<Device[]> {
    const { rows } = await sql<DeviceRow>`
      select id, driver_id, push_token, created_at, updated_at
      from identity.devices where driver_id = ${driverId}
      order by created_at asc
    `.execute(this.db);
    return rows.map(toDomain);
  }

  /** Upsert on `push_token` (the domain's own idempotency key — `registerDevice` decides
   *  create vs. reassign, this just persists whichever `Device` it built). */
  async save(device: Device): Promise<void> {
    await sql`
      insert into identity.devices (id, driver_id, push_token, created_at, updated_at)
      values (${device.id}, ${device.driverId}, ${device.pushToken}, ${device.createdAt}, ${device.updatedAt})
      on conflict (push_token) do update set
        driver_id = excluded.driver_id,
        updated_at = excluded.updated_at
    `.execute(this.db);
  }

  async deleteAllForDriver(driverId: DriverId): Promise<void> {
    await sql`delete from identity.devices where driver_id = ${driverId}`.execute(this.db);
  }
}
