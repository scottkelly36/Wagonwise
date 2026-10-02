import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { DomainEvent } from '../../../shared/domain-event.js';
import type { JobRepository } from '../application/ports/job-repository.js';
import {
  ACTIVE_STATUSES,
  type CompanyId,
  type DriverId,
  type GeoPoint,
  type Job,
  type JobId,
  type JobStatus,
  type JobStop,
  type JobStopKind,
  type JobTimelineEntry,
} from '../domain/job.js';
import type { UntypedDb } from './db.js';

interface JobRow {
  readonly id: string;
  readonly company_id: string;
  readonly reference: string;
  readonly status: JobStatus;
  readonly driver_id: string | null;
  readonly vehicle_id: string | null;
  readonly route_plan_id: string | null;
  readonly planned_start: Date | null;
  readonly due_by: Date | null;
  readonly timeline: unknown;
}

interface StopRow {
  readonly kind: JobStopKind;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly window_from: Date | null;
  readonly window_to: Date | null;
  readonly notes: string | null;
}

const JOB_SELECT_COLUMNS = `
  id, company_id, reference, status, driver_id, vehicle_id, route_plan_id, planned_start, due_by,
  timeline
`;

const STOP_SELECT_COLUMNS = `
  kind, name, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lon,
  window_from, window_to, notes
`;

/** The stored jsonb array, with anything not shaped like a timeline entry dropped rather than
 *  trusted — same approach as companies' own jsonb columns (postgres-staff-account-repository.ts). */
function timelineFrom(value: unknown): JobTimelineEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: JobTimelineEntry[] = [];
  for (const v of value as unknown[]) {
    if (typeof v !== 'object' || v === null) continue;
    const record = v as Record<string, unknown>;
    const status = record.status;
    const at = record.at;
    if (typeof status !== 'string' || typeof at !== 'string') continue;
    const position = record.position as GeoPoint | undefined;
    entries.push({
      status: status as JobStatus,
      at: new Date(at),
      ...(position === undefined ? {} : { position }),
    });
  }
  return entries;
}

function stopFromRow(row: StopRow): JobStop {
  return {
    kind: row.kind,
    name: row.name,
    location: { lat: row.lat, lon: row.lon },
    ...(row.window_from === null ? {} : { windowFrom: row.window_from }),
    ...(row.window_to === null ? {} : { windowTo: row.window_to }),
    ...(row.notes === null ? {} : { notes: row.notes }),
  };
}

function jobFromRows(job: JobRow, stops: readonly StopRow[]): Job {
  return {
    id: makeId<'JobId'>(job.id),
    companyId: makeId<'CompanyId'>(job.company_id),
    reference: job.reference,
    stops: stops.map(stopFromRow),
    status: job.status,
    timeline: timelineFrom(job.timeline),
    ...(job.driver_id === null ? {} : { driverId: makeId<'DriverId'>(job.driver_id) }),
    ...(job.vehicle_id === null ? {} : { vehicleId: makeId<'FleetVehicleId'>(job.vehicle_id) }),
    ...(job.route_plan_id === null
      ? {}
      : { routePlanId: makeId<'RoutePlanId'>(job.route_plan_id) }),
    ...(job.planned_start === null ? {} : { plannedStart: job.planned_start }),
    ...(job.due_by === null ? {} : { dueBy: job.due_by }),
  };
}

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as every
 *  other repository in this codebase (decision 26, docs/progress.md). */
export class PostgresJobRepository implements JobRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: JobId): Promise<Job | null> {
    const { rows: jobRows } = await sql<JobRow>`
      select ${sql.raw(JOB_SELECT_COLUMNS)} from jobs.jobs where id = ${id}
    `.execute(this.db);
    const jobRow = jobRows[0];
    if (!jobRow) return null;

    const [job] = await this.#withStops([jobRow]);
    return job ?? null;
  }

  async findActiveForDriver(driverId: DriverId): Promise<Job | null> {
    const { rows } = await sql<JobRow>`
      select ${sql.raw(JOB_SELECT_COLUMNS)} from jobs.jobs
      where driver_id = ${driverId} and status in (${sql.join(ACTIVE_STATUSES)})
      limit 1
    `.execute(this.db);
    const [job] = await this.#withStops(rows);
    return job ?? null;
  }

  async listForCompany(companyId: CompanyId): Promise<Job[]> {
    const { rows } = await sql<JobRow>`
      select ${sql.raw(JOB_SELECT_COLUMNS)} from jobs.jobs
      where company_id = ${companyId} order by created_at desc, id
    `.execute(this.db);
    return this.#withStops(rows);
  }

  /** The jobs with their stops, in the order given: one query for all the stops, not one each. */
  async #withStops(jobRows: readonly JobRow[]): Promise<Job[]> {
    if (jobRows.length === 0) return [];
    const { rows: stopRows } = await sql<StopRow & { job_id: string }>`
      select job_id, ${sql.raw(STOP_SELECT_COLUMNS)} from jobs.job_stops
      where job_id in (${sql.join(jobRows.map((j) => j.id))}) order by job_id, sequence
    `.execute(this.db);
    return jobRows.map((jobRow) =>
      jobFromRows(
        jobRow,
        stopRows.filter((s) => s.job_id === jobRow.id),
      ),
    );
  }

  /** No `db.transaction()` here: the staff routes already run inside a `DataScopes.run`
   *  transaction, which rejects a nested one (the bug fixed in
   *  `PostgresStaffRecoveryCodeRepository.replaceAll`, docs/progress.md). The scope's own
   *  transaction is what keeps the job and its outbox events atomic. */
  async save(job: Job, events: readonly DomainEvent[] = []): Promise<void> {
    for (const event of events) {
      await sql`
        insert into outbox.events (event_id, aggregate_type, aggregate_id, event_type, payload)
        values (${event.eventId}, ${event.aggregateType}, ${event.aggregateId}, ${event.eventType}, ${JSON.stringify(event.payload)})
      `.execute(this.db);
    }
    await sql`
      insert into jobs.jobs
        (id, company_id, reference, status, driver_id, vehicle_id, route_plan_id, planned_start,
         due_by, created_at, timeline)
      values (
        ${job.id}, ${job.companyId}, ${job.reference}, ${job.status},
        ${job.driverId ?? null}, ${job.vehicleId ?? null}, ${job.routePlanId ?? null},
        ${job.plannedStart ?? null}, ${job.dueBy ?? null}, now(),
        ${JSON.stringify(job.timeline)}::jsonb
      )
      on conflict (id) do update set
        reference = excluded.reference,
        status = excluded.status,
        driver_id = excluded.driver_id,
        vehicle_id = excluded.vehicle_id,
        route_plan_id = excluded.route_plan_id,
        planned_start = excluded.planned_start,
        due_by = excluded.due_by,
        timeline = excluded.timeline
    `.execute(this.db);

    // Stops are replaced wholesale rather than diffed: nothing edits them after creation, and
    // a job has only a few.
    await sql`delete from jobs.job_stops where job_id = ${job.id}`.execute(this.db);
    for (const [index, stop] of job.stops.entries()) {
      await sql`
        insert into jobs.job_stops
          (job_id, sequence, kind, name, location, window_from, window_to, notes)
        values (
          ${job.id}, ${index}, ${stop.kind}, ${stop.name},
          ST_SetSRID(ST_MakePoint(${stop.location.lon}, ${stop.location.lat}), 4326)::geography,
          ${stop.windowFrom ?? null}, ${stop.windowTo ?? null}, ${stop.notes ?? null}
        )
      `.execute(this.db);
    }
  }
}
