import { attachProofOfDeliveryRequestSchema } from '@wagonwise/contracts/jobs';
import * as SQLite from 'expo-sqlite';

import type { QueuedProofOfDelivery } from '../lib/proof-of-delivery-flush';

// The offline proof-of-delivery queue (P2-M5.5b): a delivery drop is exactly where signal is worst
// (yards, industrial estates), so the photo is saved on the phone first and uploaded when it can
// be. Same deliberately dumb CRUD layer as hazard-queue.ts; the policy (what's retried, what's
// dropped) lives in lib/proof-of-delivery-flush.ts. Keyed by job id, not a per-photo id: a job has
// at most one proof photo (core replaces on a retake), so a retake simply replaces the queued one.
// The base64 itself is stored, not a file path — the camera's cache file can be cleaned up by the
// OS before the upload ever succeeds.

let db: SQLite.SQLiteDatabase | undefined;

function getDb(): SQLite.SQLiteDatabase {
  if (db === undefined) {
    db = SQLite.openDatabaseSync('proof-of-delivery-queue.db');
    db.execSync(
      `create table if not exists proof_of_delivery_queue (
        job_id text primary key not null,
        content_type text not null,
        data_base64 text not null,
        created_at text not null
      );`,
    );
  }
  return db;
}

export async function enqueueProofOfDelivery(item: QueuedProofOfDelivery): Promise<void> {
  await getDb().runAsync(
    'insert or replace into proof_of_delivery_queue (job_id, content_type, data_base64, created_at) values (?, ?, ?, ?)',
    item.jobId,
    item.contentType,
    item.dataBase64,
    new Date().toISOString(),
  );
}

/** Just the ids — the photos are megabytes each, and the job screen only needs to know whether
 *  one is waiting. */
export async function listQueuedProofJobIds(): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ readonly job_id: string }>(
    'select job_id from proof_of_delivery_queue',
  );
  return rows.map((row) => row.job_id);
}

interface QueuedProofRow {
  readonly job_id: string;
  readonly content_type: string;
  readonly data_base64: string;
}

/** Oldest first. Each row is re-validated against the wire schema on the way out, so a row that
 *  somehow got damaged on disk fails here rather than as a confusing server rejection. */
export async function listQueuedProofsOfDelivery(): Promise<QueuedProofOfDelivery[]> {
  const rows = await getDb().getAllAsync<QueuedProofRow>(
    'select job_id, content_type, data_base64 from proof_of_delivery_queue order by created_at asc',
  );
  return rows.map((row) => ({
    jobId: row.job_id,
    ...attachProofOfDeliveryRequestSchema.parse({
      contentType: row.content_type,
      dataBase64: row.data_base64,
    }),
  }));
}

export async function removeQueuedProofOfDelivery(jobId: string): Promise<void> {
  await getDb().runAsync('delete from proof_of_delivery_queue where job_id = ?', jobId);
}
