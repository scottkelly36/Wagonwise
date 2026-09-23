import { sql } from 'kysely';
import type { FeedbackNoteRepository } from '../application/ports/feedback-note-repository.js';
import type { FeedbackNote } from '../domain/feedback-note.js';
import type { UntypedDb } from './db.js';

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as every
 *  other module's repositories (decision 26, docs/progress.md). */
export class PostgresFeedbackNoteRepository implements FeedbackNoteRepository {
  constructor(private readonly db: UntypedDb) {}

  /** Insert-only (the port's contract) — a `FeedbackNote` is never re-saved. */
  async save(note: FeedbackNote): Promise<void> {
    await sql`
      insert into feedback.notes (id, driver_id, message, app_version, device_info, created_at)
      values (${note.id}, ${note.driverId}, ${note.message}, ${note.appVersion}, ${note.deviceInfo}, ${note.createdAt})
    `.execute(this.db);
  }
}
