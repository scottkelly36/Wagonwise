import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { VehicleProfileRepository } from '../application/ports/vehicle-profile-repository.js';
import type { DriverId, VehicleProfile, VehicleProfileId } from '../domain/vehicle-profile.js';
import type { UntypedDb } from './db.js';

interface VehicleProfileRow {
  readonly id: string;
  readonly driver_id: string;
  readonly name: string;
  readonly height_m: number;
  readonly width_m: number;
  readonly length_m: number;
  readonly gross_weight_t: number;
  readonly axle_weight_t: number | null;
  readonly fuel_consumption_l100km: number | null;
}

function toDomain(row: VehicleProfileRow): VehicleProfile {
  return {
    id: makeId<'VehicleProfileId'>(row.id),
    driverId: makeId<'DriverId'>(row.driver_id),
    name: row.name,
    dimensions: {
      heightM: row.height_m,
      widthM: row.width_m,
      lengthM: row.length_m,
      grossWeightT: row.gross_weight_t,
      ...(row.axle_weight_t === null ? {} : { axleWeightT: row.axle_weight_t }),
    },
    ...(row.fuel_consumption_l100km === null
      ? {}
      : { fuelConsumptionL100km: row.fuel_consumption_l100km }),
  };
}

const SELECT_COLUMNS = `
  id, driver_id, name, height_m, width_m, length_m, gross_weight_t, axle_weight_t,
  fuel_consumption_l100km
`;

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as
 *  identity's Postgres repositories (decision 26, docs/progress.md). */
export class PostgresVehicleProfileRepository implements VehicleProfileRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: VehicleProfileId): Promise<VehicleProfile | null> {
    const { rows } = await sql<VehicleProfileRow>`
      select ${sql.raw(SELECT_COLUMNS)} from routing.vehicle_profiles where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async listForDriver(driverId: DriverId): Promise<VehicleProfile[]> {
    const { rows } = await sql<VehicleProfileRow>`
      select ${sql.raw(SELECT_COLUMNS)} from routing.vehicle_profiles where driver_id = ${driverId}
      order by name
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async save(profile: VehicleProfile): Promise<void> {
    await sql`
      insert into routing.vehicle_profiles
        (id, driver_id, name, height_m, width_m, length_m, gross_weight_t, axle_weight_t,
         fuel_consumption_l100km)
      values (
        ${profile.id}, ${profile.driverId}, ${profile.name},
        ${profile.dimensions.heightM}, ${profile.dimensions.widthM}, ${profile.dimensions.lengthM},
        ${profile.dimensions.grossWeightT}, ${profile.dimensions.axleWeightT ?? null},
        ${profile.fuelConsumptionL100km ?? null}
      )
      on conflict (id) do update set
        name = excluded.name,
        height_m = excluded.height_m,
        width_m = excluded.width_m,
        length_m = excluded.length_m,
        gross_weight_t = excluded.gross_weight_t,
        axle_weight_t = excluded.axle_weight_t,
        fuel_consumption_l100km = excluded.fuel_consumption_l100km
    `.execute(this.db);
  }

  async delete(id: VehicleProfileId): Promise<void> {
    await sql`delete from routing.vehicle_profiles where id = ${id}`.execute(this.db);
  }
}
