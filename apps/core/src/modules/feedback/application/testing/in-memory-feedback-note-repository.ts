import type { FeedbackNote, FeedbackNoteId } from '../../domain/feedback-note.js';
import type { FeedbackNoteRepository } from '../ports/feedback-note-repository.js';

export class InMemoryFeedbackNoteRepository implements FeedbackNoteRepository {
  #byId = new Map<FeedbackNoteId, FeedbackNote>();

  save(note: FeedbackNote): Promise<void> {
    this.#byId.set(note.id, note);
    return Promise.resolve();
  }

  /** Test-only accessor — no production caller ever lists feedback notes back out (there's no
   *  read use case at all, per the module's own scope: a one-way channel to the developer). */
  all(): FeedbackNote[] {
    return [...this.#byId.values()];
  }
}
