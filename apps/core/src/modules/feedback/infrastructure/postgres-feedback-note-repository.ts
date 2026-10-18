import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type {
  FeedbackFilter,
  FeedbackNoteRepository,
} from '../application/ports/feedback-note-repository.js';
import type { FeedbackNote, FeedbackNoteId } from '../domain/feedback-note.js';
import type { UntypedDb } from './db.js';

interface Row {
  readonly id: string;
  readonly driver_id: string;
  readonly message: string;
  readonly app_version: string;
  readonly device_info: string;
  readonly created_at: Date;
  readonly resolved_at: Date | null;
}

const toNote = (r: Row): FeedbackNote => ({
  id: makeId<'FeedbackNoteId'>(r.id),
  driverId: makeId<'DriverId'>(r.driver_id),
  message: r.message,
  appVersion: r.app_version,
  deviceInfo: r.device_info,
  createdAt: r.created_at,
  resolvedAt: r.resolved_at ?? undefined,
});

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as every
 *  other module's repositories (decision 26, docs/progress.md). */
export class PostgresFeedbackNoteRepository implements FeedbackNoteRepository {
  constructor(private readonly db: UntypedDb) {}

  async save(note: FeedbackNote): Promise<void> {
    await sql`
      insert into feedback.notes (id, driver_id, message, app_version, device_info, created_at)
      values (${note.id}, ${note.driverId}, ${note.message}, ${note.appVersion}, ${note.deviceInfo}, ${note.createdAt})
    `.execute(this.db);
  }

  async list(filter: FeedbackFilter, limit: number): Promise<FeedbackNote[]> {
    const { rows } = await sql<Row>`
      select id, driver_id, message, app_version, device_info, created_at, resolved_at
      from feedback.notes
      where (${filter} = 'all'
             or (${filter} = 'open' and resolved_at is null)
             or (${filter} = 'resolved' and resolved_at is not null))
      order by created_at desc, id
      limit ${limit}
    `.execute(this.db);
    return rows.map(toNote);
  }

  async counts(): Promise<{ open: number; resolved: number }> {
    const { rows } = await sql<{ open: number; resolved: number }>`
      select count(*) filter (where resolved_at is null)::int as open,
             count(*) filter (where resolved_at is not null)::int as resolved
      from feedback.notes
    `.execute(this.db);
    return rows[0] ?? { open: 0, resolved: 0 };
  }

  async setResolved(id: FeedbackNoteId, at: Date | null): Promise<boolean> {
    const { rows } = await sql`
      update feedback.notes set resolved_at = ${at} where id = ${id} returning 1
    `.execute(this.db);
    return rows.length > 0;
  }

  /** Deletes every note this driver sent (account deletion). */
  async deleteAllForDriver(driverId: string): Promise<void> {
    await sql`delete from feedback.notes where driver_id = ${driverId}`.execute(this.db);
  }
}
