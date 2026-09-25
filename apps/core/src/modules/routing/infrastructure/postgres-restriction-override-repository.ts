import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { RestrictionOverrideRepository } from '../application/ports/restriction-override-repository.js';
import type { GeoPoint } from '../domain/geo.js';
import type { ObstructionKind, RestrictionOverride } from '../domain/restriction-override.js';
import type { UntypedDb } from './db.js';

interface RestrictionOverrideRow {
  readonly id: string;
  readonly kind: ObstructionKind;
  readonly limit_value: number | null;
  readonly lat: number;
  readonly lon: number;
  readonly note: string | null;
  readonly created_at: Date;
}

const SELECT_COLUMNS = `
  id, kind, limit_value, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lon,
  note, created_at
`;

function toDomain(row: RestrictionOverrideRow): RestrictionOverride {
  return {
    id: makeId<'RestrictionOverrideId'>(row.id),
    kind: row.kind,
    location: { lat: row.lat, lon: row.lon },
    note: row.note ?? undefined,
    createdAt: row.created_at,
    ...(row.limit_value === null ? {} : { limit: row.limit_value }),
  };
}

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as every
 *  other repository in this codebase (decision 26, docs/progress.md). */
export class PostgresRestrictionOverrideRepository implements RestrictionOverrideRepository {
  constructor(private readonly db: UntypedDb) {}

  async findNearbyLine(
    points: readonly GeoPoint[],
    radiusM: number,
  ): Promise<RestrictionOverride[]> {
    if (points.length === 0) {
      return [];
    }
    const [only, ...rest] = points;
    if (only && rest.length === 0) {
      const { rows } = await sql<RestrictionOverrideRow>`
        select ${sql.raw(SELECT_COLUMNS)} from routing.restriction_overrides
        where ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${only.lon}, ${only.lat}), 4326)::geography,
          ${radiusM}
        )
      `.execute(this.db);
      return rows.map(toDomain);
    }
    const pointExprs = points.map((p) => sql`ST_MakePoint(${p.lon}, ${p.lat})`);
    const { rows } = await sql<RestrictionOverrideRow>`
      select ${sql.raw(SELECT_COLUMNS)} from routing.restriction_overrides
      where ST_DWithin(
        location,
        ST_SetSRID(ST_MakeLine(ARRAY[${sql.join(pointExprs)}]), 4326)::geography,
        ${radiusM}
      )
    `.execute(this.db);
    return rows.map(toDomain);
  }
}
