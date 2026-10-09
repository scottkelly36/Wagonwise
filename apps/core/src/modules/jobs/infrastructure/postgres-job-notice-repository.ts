import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { JobNotice, JobNoticeRepository, NoticeResult } from '../application/ports/notices.js';
import type { CompanyId, JobId } from '../domain/job.js';
import type { UntypedDb } from './db.js';

interface Row {
  readonly id: string;
  readonly company_id: string;
  readonly driver_id: string;
  readonly notice_result: NoticeResult | null;
  readonly notice_devices: number;
  readonly notice_attempts: number;
  readonly notice_at: Date | null;
  readonly seen_at: Date | null;
}

const COLUMNS = `id, company_id, driver_id, notice_result, notice_devices, notice_attempts, notice_at, seen_at`;

const toNotice = (row: Row): JobNotice => ({
  jobId: makeId<'JobId'>(row.id),
  companyId: makeId<'CompanyId'>(row.company_id),
  driverId: makeId<'DriverId'>(row.driver_id),
  result: row.notice_result,
  devices: row.notice_devices,
  attempts: row.notice_attempts,
  lastAttemptAt: row.notice_at,
  seenAt: row.seen_at,
});

/** Raw `sql` like every repository here (decision 26). Row-Level Security (migration 0030) limits a request to its own
 *  company's jobs, or a driver's own. */
export class PostgresJobNoticeRepository implements JobNoticeRepository {
  constructor(private readonly db: UntypedDb) {}

  async find(jobId: JobId): Promise<JobNotice | null> {
    const { rows } = await sql<Row>`
      select ${sql.raw(COLUMNS)} from jobs.jobs where id = ${jobId} and driver_id is not null
    `.execute(this.db);
    return rows[0] ? toNotice(rows[0]) : null;
  }

  async listWaiting(companyId: CompanyId): Promise<JobNotice[]> {
    const { rows } = await sql<Row>`
      select ${sql.raw(COLUMNS)} from jobs.jobs
      where company_id = ${companyId} and status = 'assigned' and driver_id is not null
      order by planned_start nulls last, id
    `.execute(this.db);
    return rows.map(toNotice);
  }

  async record(jobId: JobId, result: NoticeResult, devices: number, at: Date): Promise<void> {
    await sql`
      update jobs.jobs set notice_result = ${result}, notice_devices = ${devices},
        notice_attempts = notice_attempts + 1, notice_at = ${at}
      where id = ${jobId}
    `.execute(this.db);
  }

  async markSeen(jobId: JobId, at: Date): Promise<void> {
    await sql`
      update jobs.jobs set seen_at = ${at} where id = ${jobId} and seen_at is null
    `.execute(this.db);
  }
}
