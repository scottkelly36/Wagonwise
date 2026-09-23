import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { ActiveTripRepository } from '../application/ports/active-trip-repository.js';
import type { ActiveTrip, ActiveTripId } from '../domain/active-trip.js';
import type { DriverId } from '../domain/vehicle-profile.js';
import type { UntypedDb } from './db.js';

interface ActiveTripRow {
  readonly id: string;
  readonly route_plan_id: string;
  readonly driver_id: string;
  readonly started_at: Date;
  readonly last_position_lat: number | null;
  readonly last_position_lon: number | null;
  readonly ended_at: Date | null;
}

function toDomain(row: ActiveTripRow): ActiveTrip {
  return {
    id: makeId<'ActiveTripId'>(row.id),
    routePlanId: makeId<'RoutePlanId'>(row.route_plan_id),
    driverId: makeId<'DriverId'>(row.driver_id),
    startedAt: row.started_at,
    lastPosition:
      row.last_position_lat !== null && row.last_position_lon !== null
        ? { lat: row.last_position_lat, lon: row.last_position_lon }
        : undefined,
    endedAt: row.ended_at ?? undefined,
  };
}

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as
 *  routing's other repositories (decision 26, docs/progress.md). */
export class PostgresActiveTripRepository implements ActiveTripRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: ActiveTripId): Promise<ActiveTrip | null> {
    const { rows } = await sql<ActiveTripRow>`
      select id, route_plan_id, driver_id, started_at, last_position_lat, last_position_lon, ended_at
      from routing.active_trips where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findActiveForDriver(driverId: DriverId): Promise<ActiveTrip | null> {
    const { rows } = await sql<ActiveTripRow>`
      select id, route_plan_id, driver_id, started_at, last_position_lat, last_position_lon, ended_at
      from routing.active_trips
      where driver_id = ${driverId} and ended_at is null
      order by started_at desc
      limit 1
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  /** Upsert (the port's contract) — `endTrip` re-saves the same id with `endedAt` set. */
  async save(trip: ActiveTrip): Promise<void> {
    await sql`
      insert into routing.active_trips
        (id, route_plan_id, driver_id, started_at, last_position_lat, last_position_lon, ended_at)
      values (
        ${trip.id}, ${trip.routePlanId}, ${trip.driverId}, ${trip.startedAt},
        ${trip.lastPosition?.lat ?? null}, ${trip.lastPosition?.lon ?? null}, ${trip.endedAt ?? null}
      )
      on conflict (id) do update set
        last_position_lat = excluded.last_position_lat,
        last_position_lon = excluded.last_position_lon,
        ended_at = excluded.ended_at
    `.execute(this.db);
  }
}
