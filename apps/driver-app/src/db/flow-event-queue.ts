import * as SQLite from 'expo-sqlite';

// Steps and choices waiting to be sent (docs/flow-tracking-plan.md), so a driver who closes the app straight after a step still counts.
// Only what the contract's fixed lists allow ever gets here (`lib/flow-events.ts` checks first).

export interface QueuedFlowEvent {
  readonly id: number;
  readonly event: string;
  readonly choice?: string;
  readonly at: string;
}

let db: SQLite.SQLiteDatabase | undefined;

function getDb(): SQLite.SQLiteDatabase {
  if (db === undefined) {
    db = SQLite.openDatabaseSync('flow-events.db');
    db.execSync(
      `create table if not exists flow_events (
        id integer primary key autoincrement,
        event text not null,
        choice text,
        at text not null
      );`,
    );
  }
  return db;
}

export async function enqueueFlowEvent(item: Omit<QueuedFlowEvent, 'id'>): Promise<void> {
  await getDb().runAsync(
    'insert into flow_events (event, choice, at) values (?, ?, ?)',
    item.event,
    item.choice ?? null,
    item.at,
  );
}

interface Row {
  readonly id: number;
  readonly event: string;
  readonly choice: string | null;
  readonly at: string;
}

/** Oldest first. */
export async function listFlowEvents(limit: number): Promise<QueuedFlowEvent[]> {
  const rows = await getDb().getAllAsync<Row>(
    'select id, event, choice, at from flow_events order by id limit ?',
    limit,
  );
  return rows.map((r) => ({
    id: r.id,
    event: r.event,
    ...(r.choice === null ? {} : { choice: r.choice }),
    at: r.at,
  }));
}

export async function removeFlowEvents(ids: readonly number[]): Promise<void> {
  for (const id of ids) await getDb().runAsync('delete from flow_events where id = ?', id);
}

export async function clearFlowEvents(): Promise<void> {
  await getDb().runAsync('delete from flow_events');
}
