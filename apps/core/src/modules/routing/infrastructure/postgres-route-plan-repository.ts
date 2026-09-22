import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { RoutePlanRepository } from '../application/ports/route-plan-repository.js';
import type { AvoidedRestriction, RoutePlan, RoutePlanId } from '../domain/route-plan.js';
import type { UntypedDb } from './db.js';

interface RoutePlanRow {
  readonly id: string;
  readonly driver_id: string;
  readonly profile_id: string;
  readonly origin_lat: number;
  readonly origin_lon: number;
  readonly destination_lat: number;
  readonly destination_lon: number;
  readonly geometry: string;
  readonly distance_km: number;
  readonly duration_min: number;
  readonly avoided_restrictions: AvoidedRestriction[];
  readonly hazards_on_route: string[];
  readonly created_at: Date;
}

function toDomain(row: RoutePlanRow): RoutePlan {
  return {
    id: makeId<'RoutePlanId'>(row.id),
    driverId: makeId<'DriverId'>(row.driver_id),
    profileId: makeId<'VehicleProfileId'>(row.profile_id),
    origin: { lat: row.origin_lat, lon: row.origin_lon },
    destination: { lat: row.destination_lat, lon: row.destination_lon },
    geometry: row.geometry,
    distanceKm: row.distance_km,
    durationMin: row.duration_min,
    avoidedRestrictions: row.avoided_restrictions,
    hazardsOnRoute: row.hazards_on_route,
    createdAt: row.created_at,
  };
}

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as
 *  routing's other repositories (decision 26, docs/progress.md). */
export class PostgresRoutePlanRepository implements RoutePlanRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: RoutePlanId): Promise<RoutePlan | null> {
    const { rows } = await sql<RoutePlanRow>`
      select id, driver_id, profile_id, origin_lat, origin_lon, destination_lat, destination_lon,
             geometry, distance_km, duration_min, avoided_restrictions, hazards_on_route, created_at
      from routing.route_plans where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  /** Insert-only (the port's contract) — a `RoutePlan` is never re-saved. */
  async save(plan: RoutePlan): Promise<void> {
    await sql`
      insert into routing.route_plans
        (id, driver_id, profile_id, origin_lat, origin_lon, destination_lat, destination_lon,
         geometry, distance_km, duration_min, avoided_restrictions, hazards_on_route, created_at)
      values (
        ${plan.id}, ${plan.driverId}, ${plan.profileId},
        ${plan.origin.lat}, ${plan.origin.lon}, ${plan.destination.lat}, ${plan.destination.lon},
        ${plan.geometry}, ${plan.distanceKm}, ${plan.durationMin},
        ${JSON.stringify(plan.avoidedRestrictions)}, ${JSON.stringify(plan.hazardsOnRoute)},
        ${plan.createdAt}
      )
    `.execute(this.db);
  }
}
