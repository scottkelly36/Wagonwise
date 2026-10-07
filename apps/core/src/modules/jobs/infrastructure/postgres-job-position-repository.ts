import { sql } from 'kysely';
import type { CompanyId, JobId } from '../domain/job.js';
import { TRACKED_STATUSES } from '../domain/job.js';
import type {
  JobPosition,
  JobPositionRepository,
} from '../application/ports/job-position-repository.js';
import type { UntypedDb } from './db.js';

interface PositionRow {
  readonly job_id: string;
  readonly lat: number;
  readonly lon: number;
  readonly recorded_at: Date;
}

export class PostgresJobPositionRepository implements JobPositionRepository {
  constructor(private readonly db: UntypedDb) {}

  async record(position: JobPosition): Promise<void> {
    await sql`
      insert into jobs.job_positions (job_id, recorded_at, location)
      values (
        ${position.jobId}, ${position.recordedAt},
        ST_SetSRID(ST_MakePoint(${position.location.lon}, ${position.location.lat}), 4326)::geography
      )
      on conflict (job_id, recorded_at) do nothing
    `.execute(this.db);
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const { rows } = await sql<{ removed: string }>`
      with gone as (
        delete from jobs.job_positions where recorded_at < ${cutoff} returning 1
      )
      select count(*)::text as removed from gone
    `.execute(this.db);
    return Number(rows[0]?.removed ?? 0);
  }

  async latestForCompany(companyId: CompanyId): Promise<JobPosition[]> {
    const { rows } = await sql<PositionRow>`
      select distinct on (p.job_id)
        p.job_id, ST_Y(p.location::geometry) as lat, ST_X(p.location::geometry) as lon,
        p.recorded_at
      from jobs.job_positions p
      join jobs.jobs j on j.id = p.job_id
      where j.company_id = ${companyId} and j.status in (${sql.join([...TRACKED_STATUSES])})
      order by p.job_id, p.recorded_at desc
    `.execute(this.db);
    return rows.map((row) => ({
      jobId: row.job_id as JobId,
      location: { lat: row.lat, lon: row.lon },
      recordedAt: row.recorded_at,
    }));
  }
}
