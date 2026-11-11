import { attachSignatureRequestSchema } from '@wagonwise/contracts/jobs';
import * as SQLite from 'expo-sqlite';

import type { QueuedSignature } from '../lib/signature-flush';

// The offline signature queue, the same idea as the proof-of-delivery photo queue: a drop is where signal is worst, so
// the signature is saved on the phone first and uploaded when it can be. Keyed by job id (core replaces on a second
// signature, so a new one simply replaces the queued one). The strokes are stored as JSON, not as a file.

let db: SQLite.SQLiteDatabase | undefined;

function getDb(): SQLite.SQLiteDatabase {
  if (db === undefined) {
    db = SQLite.openDatabaseSync('signature-queue.db');
    db.execSync(
      `create table if not exists signature_queue (
        job_id text primary key not null,
        signer_name text,
        strokes_json text not null,
        created_at text not null
      );`,
    );
  }
  return db;
}

export async function enqueueSignature(item: QueuedSignature): Promise<void> {
  await getDb().runAsync(
    'insert or replace into signature_queue (job_id, signer_name, strokes_json, created_at) values (?, ?, ?, ?)',
    item.jobId,
    item.signerName ?? null,
    JSON.stringify(item.strokes),
    new Date().toISOString(),
  );
}

export async function listQueuedSignatureJobIds(): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ readonly job_id: string }>(
    'select job_id from signature_queue',
  );
  return rows.map((row) => row.job_id);
}

interface QueuedSignatureRow {
  readonly job_id: string;
  readonly signer_name: string | null;
  readonly strokes_json: string;
}

/** Oldest first. A row that is damaged on disk is dropped here, not sent: the server would only refuse it for good. */
export async function listQueuedSignatures(): Promise<QueuedSignature[]> {
  const rows = await getDb().getAllAsync<QueuedSignatureRow>(
    'select job_id, signer_name, strokes_json from signature_queue order by created_at asc',
  );
  const items: QueuedSignature[] = [];
  for (const row of rows) {
    let strokes: unknown;
    try {
      strokes = JSON.parse(row.strokes_json);
    } catch {
      await removeQueuedSignature(row.job_id);
      continue;
    }
    const parsed = attachSignatureRequestSchema.safeParse({
      ...(row.signer_name === null ? {} : { signerName: row.signer_name }),
      strokes,
    });
    if (parsed.success) items.push({ jobId: row.job_id, ...parsed.data });
    else await removeQueuedSignature(row.job_id);
  }
  return items;
}

export async function removeQueuedSignature(jobId: string): Promise<void> {
  await getDb().runAsync('delete from signature_queue where job_id = ?', jobId);
}
