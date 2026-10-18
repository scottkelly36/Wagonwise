import type { FeedbackNote, FeedbackNoteId } from '../../domain/feedback-note.js';

export type FeedbackFilter = 'open' | 'resolved' | 'all';

export interface FeedbackNoteRepository {
  /** Insert-only for a driver's note: it is never edited by the driver. (Staff resolving it only sets `resolvedAt`.) */
  save(note: FeedbackNote): Promise<void>;

  // --- for WagonWise staff ---
  /** Newest first, narrowed to open or resolved notes. */
  list(filter: FeedbackFilter, limit: number): Promise<FeedbackNote[]>;
  /** How many notes are open and how many resolved, whatever the filter. */
  counts(): Promise<{ open: number; resolved: number }>;
  /** Marks a note resolved at `at`, or reopens it with null. False if there is no such note. */
  setResolved(id: FeedbackNoteId, at: Date | null): Promise<boolean>;
  /** Deletes every note this driver sent (account deletion). */
  deleteAllForDriver(driverId: string): Promise<void>;
}
