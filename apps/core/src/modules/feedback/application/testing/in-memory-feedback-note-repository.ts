import type { FeedbackNote, FeedbackNoteId } from '../../domain/feedback-note.js';
import type { FeedbackFilter, FeedbackNoteRepository } from '../ports/feedback-note-repository.js';

export class InMemoryFeedbackNoteRepository implements FeedbackNoteRepository {
  #byId = new Map<FeedbackNoteId, FeedbackNote>();

  save(note: FeedbackNote): Promise<void> {
    this.#byId.set(note.id, note);
    return Promise.resolve();
  }

  list(filter: FeedbackFilter, limit: number): Promise<FeedbackNote[]> {
    const notes = [...this.#byId.values()]
      .filter(
        (n) =>
          filter === 'all' ||
          (filter === 'open' ? n.resolvedAt === undefined : n.resolvedAt !== undefined),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve(notes.slice(0, limit));
  }

  counts(): Promise<{ open: number; resolved: number }> {
    const all = [...this.#byId.values()];
    const resolved = all.filter((n) => n.resolvedAt !== undefined).length;
    return Promise.resolve({ open: all.length - resolved, resolved });
  }

  setResolved(id: FeedbackNoteId, at: Date | null): Promise<boolean> {
    const note = this.#byId.get(id);
    if (note === undefined) return Promise.resolve(false);
    this.#byId.set(id, { ...note, resolvedAt: at ?? undefined });
    return Promise.resolve(true);
  }

  deleteAllForDriver(driverId: string): Promise<void> {
    for (const [id, n] of this.#byId) if (n.driverId === driverId) this.#byId.delete(id);
    return Promise.resolve();
  }

  /** Test-only accessor. */
  all(): FeedbackNote[] {
    return [...this.#byId.values()];
  }
}
