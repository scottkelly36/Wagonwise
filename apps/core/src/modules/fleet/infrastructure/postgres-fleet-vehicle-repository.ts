import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { FleetVehicleRepository } from '../application/ports/fleet-vehicle-repository.js';
import type { CompanyId, FleetVehicle, FleetVehicleId } from '../domain/vehicle.js';
import type { UntypedDb } from './db.js';

interface FleetVehicleRow {
  readonly id: string;
  readonly company_id: string;
  readonly name: string;
  readonly height_m: number;
  readonly width_m: number;
  readonly length_m: number;
  readonly gross_weight_t: number;
  readonly axle_weight_t: number | null;
  readonly registration: string | null;
}

function toDomain(row: FleetVehicleRow): FleetVehicle {
  return {
    id: makeId<'FleetVehicleId'>(row.id),
    companyId: makeId<'CompanyId'>(row.company_id),
    name: row.name,
    ...(row.registration === null ? {} : { registration: row.registration }),
    dimensions: {
      heightM: row.height_m,
      widthM: row.width_m,
      lengthM: row.length_m,
      grossWeightT: row.gross_weight_t,
      ...(row.axle_weight_t === null ? {} : { axleWeightT: row.axle_weight_t }),
    },
  };
}

const SELECT_COLUMNS = `
  id, company_id, name, height_m, width_m, length_m, gross_weight_t, axle_weight_t, registration
`;

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as every
 *  other repository in this codebase (decision 26, docs/progress.md). */
export class PostgresFleetVehicleRepository implements FleetVehicleRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: FleetVehicleId): Promise<FleetVehicle | null> {
    const { rows } = await sql<FleetVehicleRow>`
      select ${sql.raw(SELECT_COLUMNS)} from fleet.vehicles where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async listForCompany(companyId: CompanyId): Promise<FleetVehicle[]> {
    const { rows } = await sql<FleetVehicleRow>`
      select ${sql.raw(SELECT_COLUMNS)} from fleet.vehicles where company_id = ${companyId}
      order by name
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async findByRegistration(
    companyId: CompanyId,
    registration: string,
  ): Promise<FleetVehicle | null> {
    const { rows } = await sql<FleetVehicleRow>`
      select ${sql.raw(SELECT_COLUMNS)} from fleet.vehicles
      where company_id = ${companyId} and registration = ${registration}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async save(vehicle: FleetVehicle): Promise<void> {
    await sql`
      insert into fleet.vehicles
        (id, company_id, name, height_m, width_m, length_m, gross_weight_t, axle_weight_t, registration)
      values (
        ${vehicle.id}, ${vehicle.companyId}, ${vehicle.name},
        ${vehicle.dimensions.heightM}, ${vehicle.dimensions.widthM}, ${vehicle.dimensions.lengthM},
        ${vehicle.dimensions.grossWeightT}, ${vehicle.dimensions.axleWeightT ?? null},
        ${vehicle.registration ?? null}
      )
      on conflict (id) do update set
        name = excluded.name,
        height_m = excluded.height_m,
        width_m = excluded.width_m,
        length_m = excluded.length_m,
        gross_weight_t = excluded.gross_weight_t,
        axle_weight_t = excluded.axle_weight_t,
        registration = excluded.registration
    `.execute(this.db);
  }

  async delete(id: FleetVehicleId): Promise<void> {
    await sql`delete from fleet.vehicles where id = ${id}`.execute(this.db);
  }
}
