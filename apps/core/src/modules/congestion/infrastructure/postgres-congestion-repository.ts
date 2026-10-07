import { sql } from 'kysely';
import { lineWkt } from '../../../shared/line-wkt.js';
import { makeId } from '../../../shared/brand.js';
import type { CongestionRepository } from '../application/ports/congestion-repository.js';
import type { CongestionReport, GeoPoint } from '../domain/congestion-report.js';
import type { UntypedDb } from './db.js';

interface CongestionReportRow {
  readonly id: string;
  readonly reporter_id: string;
  readonly lat: number;
  readonly lon: number;
  readonly estimated_wait_minutes: number;
  readonly created_at: Date;
  readonly expires_at: Date;
}

const SELECT_COLUMNS = `
  id, reporter_id, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lon,
  estimated_wait_minutes, created_at, expires_at
`;

function toDomain(row: CongestionReportRow): CongestionReport {
  return {
    id: makeId<'CongestionReportId'>(row.id),
    reporterId: makeId<'DriverId'>(row.reporter_id),
    location: { lat: row.lat, lon: row.lon },
    estimatedWaitMinutes: row.estimated_wait_minutes,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as every
 *  other repository in this codebase (decision 26, docs/progress.md). */
export class PostgresCongestionRepository implements CongestionRepository {
  constructor(private readonly db: UntypedDb) {}

  async findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<CongestionReport[]> {
    if (points.length === 0) {
      return [];
    }
    const [only, ...rest] = points;
    if (only && rest.length === 0) {
      const { rows } = await sql<CongestionReportRow>`
        select ${sql.raw(SELECT_COLUMNS)} from congestion.reports
        where ST_DWithin(
          location,
          ST_SetSRID(ST_MakePoint(${only.lon}, ${only.lat}), 4326)::geography,
          ${radiusM}
        )
        order by created_at desc
      `.execute(this.db);
      return rows.map(toDomain);
    }

    const { rows } = await sql<CongestionReportRow>`
      select ${sql.raw(SELECT_COLUMNS)} from congestion.reports
      where ST_DWithin(
        location,
        ST_GeogFromText(${lineWkt(points)}),
        ${radiusM}
      )
      order by created_at desc
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async save(report: CongestionReport): Promise<void> {
    await sql`
      insert into congestion.reports
        (id, reporter_id, location, estimated_wait_minutes, created_at, expires_at)
      values (
        ${report.id}, ${report.reporterId},
        ST_SetSRID(ST_MakePoint(${report.location.lon}, ${report.location.lat}), 4326)::geography,
        ${report.estimatedWaitMinutes}, ${report.createdAt}, ${report.expiresAt}
      )
    `.execute(this.db);
  }
}
