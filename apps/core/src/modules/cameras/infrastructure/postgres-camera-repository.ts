import { sql } from 'kysely';
import { lineWkt } from '../../../shared/line-wkt.js';
import type { CameraRepository } from '../application/ports/camera-repository.js';
import type { CameraKind, GeoPoint, SpeedCamera } from '../domain/speed-camera.js';
import type { UntypedDb } from './db.js';

interface CameraRow {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly kind: CameraKind;
  readonly maxspeed_mph: number | null;
}

const toDomain = (row: CameraRow): SpeedCamera => ({
  id: row.id,
  location: { lat: row.lat, lon: row.lon },
  kind: row.kind,
  maxspeedMph: row.maxspeed_mph ?? undefined,
});

const COLUMNS = `c.id, ST_Y(c.location::geometry) as lat, ST_X(c.location::geometry) as lon, c.kind, c.maxspeed_mph`;

/** Raw `sql` queries, not Kysely's typed builder, like every other repository here (decision 26). */
export class PostgresCameraRepository implements CameraRepository {
  constructor(private readonly db: UntypedDb) {}

  async findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<SpeedCamera[]> {
    if (points.length === 0) return [];
    const [only, ...rest] = points;
    if (only && rest.length === 0) {
      const { rows } = await sql<CameraRow>`
        select ${sql.raw(COLUMNS)} from cameras.speed_cameras c
        where ST_DWithin(
          c.location,
          ST_SetSRID(ST_MakePoint(${only.lon}, ${only.lat}), 4326)::geography,
          ${radiusM}
        )
        order by c.id
      `.execute(this.db);
      return rows.map(toDomain);
    }
    const { rows } = await sql<CameraRow>`
      select ${sql.raw(COLUMNS)} from cameras.speed_cameras c
      where ST_DWithin(c.location, ST_GeogFromText(${lineWkt(points)}), ${radiusM})
      order by c.id
    `.execute(this.db);
    return rows.map(toDomain);
  }
}
