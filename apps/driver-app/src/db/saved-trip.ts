import {
  activeTripSchema,
  routePlanSchema,
  type ActiveTripDto,
  type RoutePlanDto,
} from '@wagonwise/contracts/routing';
import * as SQLite from 'expo-sqlite';

// The trip in progress, kept on the phone so that opening the app with no signal (a tunnel, a dead spot, the app restarting
// mid-drive) puts the driver back on their route instead of at the home screen. One row: a driver has one trip at a time. The
// server stays the source of truth whenever it can be reached; this is only what the app falls back to.

export interface SavedTrip {
  readonly trip: ActiveTripDto;
  readonly plan: RoutePlanDto;
  /** When it was saved (ISO), so a trip left on the phone for a day is not brought back. */
  readonly savedAt: string;
}

let db: SQLite.SQLiteDatabase | undefined;

function getDb(): SQLite.SQLiteDatabase {
  if (db === undefined) {
    db = SQLite.openDatabaseSync('saved-trip.db');
    db.execSync(
      `create table if not exists saved_trip (
        slot integer primary key not null,
        trip_json text not null,
        plan_json text not null,
        saved_at text not null
      );`,
    );
  }
  return db;
}

export async function saveTrip(
  trip: ActiveTripDto,
  plan: RoutePlanDto,
  now: Date = new Date(),
): Promise<void> {
  await getDb().runAsync(
    'insert or replace into saved_trip (slot, trip_json, plan_json, saved_at) values (1, ?, ?, ?)',
    JSON.stringify(trip),
    JSON.stringify(plan),
    now.toISOString(),
  );
}

interface SavedTripRow {
  readonly trip_json: string;
  readonly plan_json: string;
  readonly saved_at: string;
}

/** The saved trip, or `undefined` when there is none. A row damaged on disk is dropped, not trusted. */
export async function loadSavedTrip(): Promise<SavedTrip | undefined> {
  const rows = await getDb().getAllAsync<SavedTripRow>(
    'select trip_json, plan_json, saved_at from saved_trip where slot = 1',
  );
  const row = rows[0];
  if (row === undefined) return undefined;
  try {
    const trip = activeTripSchema.parse(JSON.parse(row.trip_json));
    const plan = routePlanSchema.parse(JSON.parse(row.plan_json));
    return { trip, plan, savedAt: row.saved_at };
  } catch {
    await clearSavedTrip();
    return undefined;
  }
}

export async function clearSavedTrip(): Promise<void> {
  await getDb().runAsync('delete from saved_trip where slot = 1');
}
