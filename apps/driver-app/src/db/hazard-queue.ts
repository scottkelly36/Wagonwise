import { reportHazardRequestSchema, type ReportHazardRequest } from '@wagonwise/contracts/hazards';
import * as SQLite from 'expo-sqlite';

// The offline hazard queue (design doc §5/§8): "App assigns a client-generated UUID and stores
// it locally first... Queue flushes to the BFF when online." A thin, deliberately dumb CRUD
// layer — all the interesting policy (what order to send in, when to give up for this pass)
// lives in the fully-tested lib/hazard-queue-flush.ts, not here. Verified by reading
// expo-sqlite's own installed type declarations for the real API shape (same discipline M5.4/
// M5.5 used for MapLibre), not by a real device run — no native build toolchain on this machine
// (docs/progress.md, every driver-app milestone since M5.1).

let db: SQLite.SQLiteDatabase | undefined;

function getDb(): SQLite.SQLiteDatabase {
  if (db === undefined) {
    db = SQLite.openDatabaseSync('hazard-queue.db');
    db.execSync(
      `create table if not exists hazard_queue (
        id text primary key not null,
        payload text not null,
        created_at text not null
      );`,
    );
  }
  return db;
}

export async function enqueueHazardReport(request: ReportHazardRequest): Promise<void> {
  await getDb().runAsync(
    'insert into hazard_queue (id, payload, created_at) values (?, ?, ?)',
    request.id,
    JSON.stringify(request),
    new Date().toISOString(),
  );
}

interface HazardQueueRow {
  readonly payload: string;
}

/** Oldest first — a driver's reports go out in the order they made them. `.parse()` re-brands
 *  the id coming back out of a plain JSON string (the same brand-at-the-boundary pattern used
 *  everywhere else a branded id crosses a wire/storage boundary), rather than trusting the JSON
 *  blob was never tampered with between write and read. */
export async function listQueuedHazardReports(): Promise<ReportHazardRequest[]> {
  const rows = await getDb().getAllAsync<HazardQueueRow>(
    'select payload from hazard_queue order by created_at asc',
  );
  return rows.map((row) => reportHazardRequestSchema.parse(JSON.parse(row.payload)));
}

export async function removeQueuedHazardReport(id: string): Promise<void> {
  await getDb().runAsync('delete from hazard_queue where id = ?', id);
}
