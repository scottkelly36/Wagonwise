import type { FeedbackNote } from '../../domain/feedback-note.js';

export interface FeedbackNoteRepository {
  /** Insert-only — a `FeedbackNote` is never edited or deleted once sent, same reasoning as
   *  `RoutePlan` (decision 10): a note is a point-in-time message to the developer, not a
   *  record anything revises afterwards. */
  save(note: FeedbackNote): Promise<void>;
}
