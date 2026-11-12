import { advanceJobStatusRequestSchema, type JobStatus } from '@wagonwise/contracts/jobs';
import * as SQLite from 'expo-sqlite';

// What the driver did with no signal that the server has not heard yet: end the trip, and for a job, say they have arrived.
// Saved on the phone first and sent when it can be, in the order it happened, the same idea as the photo and signature queues.
// Keyed by trip id: ending a trip twice is one end.

export interface PendingTripEnd {
  readonly tripId: string;
  /** When the driver tapped (ISO), so the server records the trip as ended then and not when the signal came back. */
  readonly endedAt?: string;
  /** For "Arrived" on a job: the job moves to this status first, then the trip ends. Absent for a plain End trip. */
  readonly jobAdvance?: { readonly jobId: string; readonly status: JobStatus };
}

let db: SQLite.SQLiteDatabase | undefined;

function getDb(): SQLite.SQLiteDatabase {
  if (db === undefined) {
    db = SQLite.openDatabaseSync('trip-outbox.db');
    db.execSync(
      `create table if not exists trip_outbox (
        trip_id text primary key not null,
        job_id text,
        job_status text,
        queued_at text not null,
        ended_at text
      );`,
    );
    try {
      // A phone that made the table before it had the column.
      db.execSync('alter table trip_outbox add column ended_at text');
    } catch {
      // Already there.
    }
  }
  return db;
}

export async function enqueueTripEnd(item: PendingTripEnd): Promise<void> {
  await getDb().runAsync(
    'insert or replace into trip_outbox (trip_id, job_id, job_status, queued_at, ended_at) values (?, ?, ?, ?, ?)',
    item.tripId,
    item.jobAdvance?.jobId ?? null,
    item.jobAdvance?.status ?? null,
    new Date().toISOString(),
    item.endedAt ?? null,
  );
}

interface OutboxRow {
  readonly trip_id: string;
  readonly job_id: string | null;
  readonly job_status: string | null;
  readonly ended_at?: string | null;
}

/** Oldest first. A row whose status the app no longer knows is kept as a plain end, so the trip is still ended. */
export async function listPendingTripEnds(): Promise<PendingTripEnd[]> {
  const rows = await getDb().getAllAsync<OutboxRow>(
    'select trip_id, job_id, job_status, ended_at from trip_outbox order by queued_at asc',
  );
  return rows.map((row) => {
    const parsed =
      row.job_id === null
        ? undefined
        : advanceJobStatusRequestSchema.safeParse({ status: row.job_status });
    const endedAt =
      row.ended_at === null || row.ended_at === undefined ? {} : { endedAt: row.ended_at };
    return parsed?.success && row.job_id !== null
      ? {
          tripId: row.trip_id,
          ...endedAt,
          jobAdvance: { jobId: row.job_id, status: parsed.data.status },
        }
      : { tripId: row.trip_id, ...endedAt };
  });
}

export async function removePendingTripEnd(tripId: string): Promise<void> {
  await getDb().runAsync('delete from trip_outbox where trip_id = ?', tripId);
}
