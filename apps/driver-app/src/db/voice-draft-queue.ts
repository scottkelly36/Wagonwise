import type { ParsedVoiceHazardReportDto } from '@wagonwise/contracts/hazards';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

import type { MapPoint } from '../components/route-map';

// A voice report the driver didn't confirm — design doc §7 step 4: "saved as an unconfirmed
// draft for review later when parked, not filed publicly." A separate table from
// `hazard-queue.ts`'s `hazard_queue` deliberately — that table's rows are already-confirmed
// reports waiting only on connectivity (`use-hazard-queue-flush.ts` auto-retries them); a row
// here has never been confirmed at all and must never be auto-sent. Reviewing/editing/discarding
// these is M7.4's screen; this is only the storage layer it will read from.
export interface VoiceHazardDraft {
  readonly id: string;
  readonly transcript: string;
  readonly parsed: ParsedVoiceHazardReportDto;
  readonly origin: MapPoint | undefined;
  readonly createdAt: string;
}

let db: SQLite.SQLiteDatabase | undefined;

function getDb(): SQLite.SQLiteDatabase {
  if (db === undefined) {
    db = SQLite.openDatabaseSync('voice-draft-queue.db');
    db.execSync(
      `create table if not exists voice_hazard_drafts (
        id text primary key not null,
        payload text not null,
        created_at text not null
      );`,
    );
  }
  return db;
}

export async function saveVoiceHazardDraft(
  draft: Omit<VoiceHazardDraft, 'id' | 'createdAt'>,
): Promise<VoiceHazardDraft> {
  const saved: VoiceHazardDraft = {
    ...draft,
    id: Crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await getDb().runAsync(
    'insert into voice_hazard_drafts (id, payload, created_at) values (?, ?, ?)',
    saved.id,
    JSON.stringify(saved),
    saved.createdAt,
  );
  return saved;
}

interface VoiceDraftRow {
  readonly payload: string;
}

/** Newest first — a driver reviewing drafts when parked most likely wants to deal with the one
 *  they just made, not scroll past older ones first. */
export async function listVoiceHazardDrafts(): Promise<VoiceHazardDraft[]> {
  const rows = await getDb().getAllAsync<VoiceDraftRow>(
    'select payload from voice_hazard_drafts order by created_at desc',
  );
  return rows.map((row) => JSON.parse(row.payload) as VoiceHazardDraft);
}

export async function removeVoiceHazardDraft(id: string): Promise<void> {
  await getDb().runAsync('delete from voice_hazard_drafts where id = ?', id);
}
