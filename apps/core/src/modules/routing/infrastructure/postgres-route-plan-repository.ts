import { sql } from 'kysely';
import { lineWkt } from '../../../shared/line-wkt.js';
import { makeId } from '../../../shared/brand.js';
import type { RoutePlanRepository } from '../application/ports/route-plan-repository.js';
import { decodePolyline, type GeoPoint } from '../domain/geo.js';
import type { Maneuver } from '../domain/maneuver.js';
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
  readonly maneuvers: Maneuver[];
  readonly created_at: Date;
  readonly estimated_fuel_cost_gbp: number | null;
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
    maneuvers: row.maneuvers,
    hazardsOnRoute: row.hazards_on_route,
    createdAt: row.created_at,
    ...(row.estimated_fuel_cost_gbp === null
      ? {}
      : { estimatedFuelCostGBP: row.estimated_fuel_cost_gbp }),
  };
}

const SELECT_COLUMNS = `
  id, driver_id, profile_id, origin_lat, origin_lon, destination_lat, destination_lon,
  geometry, distance_km, duration_min, avoided_restrictions, hazards_on_route, created_at,
  estimated_fuel_cost_gbp, maneuvers
`;

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as
 *  routing's other repositories (decision 26, docs/progress.md). */
export class PostgresRoutePlanRepository implements RoutePlanRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: RoutePlanId): Promise<RoutePlan | null> {
    const { rows } = await sql<RoutePlanRow>`
      select ${sql.raw(SELECT_COLUMNS)} from routing.route_plans where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  /** Insert-only (the port's contract) — a `RoutePlan` is never re-saved. `geometry_geog`
   *  (M6.4) is computed once here, from the same decoded points `geometry` itself encodes —
   *  a derived, queryable copy, not a second source of truth. */
  async save(plan: RoutePlan): Promise<void> {
    const points = decodePolyline(plan.geometry);
    const geog = points.length >= 2 ? sql`ST_GeogFromText(${lineWkt(points)})` : sql`null`;

    await sql`
      insert into routing.route_plans
        (id, driver_id, profile_id, origin_lat, origin_lon, destination_lat, destination_lon,
         geometry, geometry_geog, distance_km, duration_min, avoided_restrictions,
         hazards_on_route, created_at, estimated_fuel_cost_gbp, maneuvers)
      values (
        ${plan.id}, ${plan.driverId}, ${plan.profileId},
        ${plan.origin.lat}, ${plan.origin.lon}, ${plan.destination.lat}, ${plan.destination.lon},
        ${plan.geometry}, ${geog}, ${plan.distanceKm}, ${plan.durationMin},
        ${JSON.stringify(plan.avoidedRestrictions)}, ${JSON.stringify(plan.hazardsOnRoute)},
        ${plan.createdAt}, ${plan.estimatedFuelCostGBP ?? null}, ${JSON.stringify(plan.maneuvers)}::jsonb
      )
    `.execute(this.db);
  }

  /** Plans created since `since`, with no row at all in `routing.active_trips` (however that
   *  trip later ended, if it did — "hasn't started a trip" per design doc §6 step 1, not "has
   *  no trip in progress right now"), whose geometry passes within `radiusM` of `location`. */
  async findRecentUnstartedNear(
    location: GeoPoint,
    radiusM: number,
    since: Date,
  ): Promise<RoutePlan[]> {
    const { rows } = await sql<RoutePlanRow>`
      select rp.id, rp.driver_id, rp.profile_id, rp.origin_lat, rp.origin_lon,
             rp.destination_lat, rp.destination_lon, rp.geometry, rp.distance_km,
             rp.duration_min, rp.avoided_restrictions, rp.hazards_on_route, rp.created_at,
             rp.estimated_fuel_cost_gbp, rp.maneuvers
      from routing.route_plans rp
      where rp.created_at >= ${since}
        and rp.geometry_geog is not null
        and ST_DWithin(
          rp.geometry_geog,
          ST_SetSRID(ST_MakePoint(${location.lon}, ${location.lat}), 4326)::geography,
          ${radiusM}
        )
        and not exists (
          select 1 from routing.active_trips at where at.route_plan_id = rp.id
        )
      order by rp.created_at desc
    `.execute(this.db);
    return rows.map(toDomain);
  }
}
