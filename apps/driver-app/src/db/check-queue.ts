import {
  attachCheckPhotoRequestSchema,
  checksDueResponseSchema,
  submitCheckRequestSchema,
  type ChecksDueResponse,
} from '@wagonwise/contracts/checks';
import * as SQLite from 'expo-sqlite';

import type { QueuedCheck } from '../lib/check-queue-flush';

// The offline walk-round check queue. A check is done in a yard or at the roadside, where signal is patchy, so a
// finished check is saved on the phone first and sent when it can be, with its photos. Same deliberately dumb CRUD
// layer as proof-of-delivery-queue.ts; what is retried and what is dropped lives in lib/check-queue-flush.ts.
//
// Photos are written before the check row, so a check that is in the queue always has its photos with it. The
// photo itself is stored as base64, not a file path: the camera's cache file can be cleaned up by the OS long
// before the upload succeeds.
//
// The last lists the server gave (`check_due_cache`) are kept too, so a driver who is offline at the vehicle can
// still do the check: the lists were fetched earlier, when there was signal.

let db: SQLite.SQLiteDatabase | undefined;

function getDb(): SQLite.SQLiteDatabase {
  if (db === undefined) {
    db = SQLite.openDatabaseSync('check-queue.db');
    db.execSync(
      `create table if not exists check_queue (
        check_id text primary key not null,
        request_json text not null,
        created_at text not null
      );
      create table if not exists check_photo_queue (
        check_id text not null,
        item_id text not null,
        content_type text not null,
        data_base64 text not null,
        primary key (check_id, item_id)
      );
      create table if not exists check_due_cache (
        id integer primary key not null,
        json text not null,
        saved_at text not null
      );`,
    );
  }
  return db;
}

export async function enqueueCheck(item: QueuedCheck): Promise<void> {
  const database = getDb();
  for (const photo of item.photos) {
    await database.runAsync(
      'insert or replace into check_photo_queue (check_id, item_id, content_type, data_base64) values (?, ?, ?, ?)',
      item.request.id,
      photo.itemId,
      photo.contentType,
      photo.dataBase64,
    );
  }
  await database.runAsync(
    'insert or replace into check_queue (check_id, request_json, created_at) values (?, ?, ?)',
    item.request.id,
    JSON.stringify(item.request),
    new Date().toISOString(),
  );
}

interface CheckRow {
  readonly check_id: string;
  readonly request_json: string;
}
interface PhotoRow {
  readonly check_id: string;
  readonly item_id: string;
  readonly content_type: string;
  readonly data_base64: string;
}

/** Oldest first. Each row is re-validated against the wire schema on the way out, so a row damaged on disk fails
 *  here rather than as a confusing server rejection. */
export async function listQueuedChecks(): Promise<QueuedCheck[]> {
  const database = getDb();
  const checks = await database.getAllAsync<CheckRow>(
    'select check_id, request_json from check_queue order by created_at asc',
  );
  if (checks.length === 0) return [];
  const photos = await database.getAllAsync<PhotoRow>(
    'select check_id, item_id, content_type, data_base64 from check_photo_queue',
  );
  return checks.map((row) => ({
    request: submitCheckRequestSchema.parse(JSON.parse(row.request_json)),
    photos: photos
      .filter((p) => p.check_id === row.check_id)
      .map((p) => ({
        itemId: p.item_id,
        ...attachCheckPhotoRequestSchema.parse({
          contentType: p.content_type,
          dataBase64: p.data_base64,
        }),
      })),
  }));
}

/** Which lists on which vehicle are already done on the phone, waiting to be sent. Light: no photos. */
export async function listQueuedCheckSummaries(): Promise<
  { readonly checkId: string; readonly templateId: string; readonly vehicleId: string }[]
> {
  const checks = await getDb().getAllAsync<CheckRow>(
    'select check_id, request_json from check_queue',
  );
  return checks.map((row) => {
    const request = submitCheckRequestSchema.parse(JSON.parse(row.request_json));
    return { checkId: row.check_id, templateId: request.templateId, vehicleId: request.vehicleId };
  });
}

export async function removeQueuedCheckPhoto(checkId: string, itemId: string): Promise<void> {
  await getDb().runAsync(
    'delete from check_photo_queue where check_id = ? and item_id = ?',
    checkId,
    itemId,
  );
}

export async function removeQueuedCheck(checkId: string): Promise<void> {
  const database = getDb();
  await database.runAsync('delete from check_photo_queue where check_id = ?', checkId);
  await database.runAsync('delete from check_queue where check_id = ?', checkId);
}

export async function saveChecksDue(due: ChecksDueResponse): Promise<void> {
  await getDb().runAsync(
    'insert or replace into check_due_cache (id, json, saved_at) values (1, ?, ?)',
    JSON.stringify(due),
    new Date().toISOString(),
  );
}

/** The last lists the server gave, or `undefined` if there are none or they can no longer be read. */
export async function readChecksDue(): Promise<ChecksDueResponse | undefined> {
  const rows = await getDb().getAllAsync<{ readonly json: string }>(
    'select json from check_due_cache where id = 1',
  );
  const row = rows[0];
  if (row === undefined) return undefined;
  const parsed = checksDueResponseSchema.safeParse(JSON.parse(row.json));
  return parsed.success ? parsed.data : undefined;
}
