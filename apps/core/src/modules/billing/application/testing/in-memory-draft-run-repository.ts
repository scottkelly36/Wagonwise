import type { DraftRunRepository } from '../ports/draft-run-repository.js';

export class InMemoryDraftRunRepository implements DraftRunRepository {
  readonly runs = new Map<string, { drafts: number; totalPence: number; ranAt: Date }>();

  has(month: string): Promise<boolean> {
    return Promise.resolve(this.runs.has(month));
  }

  record(run: { month: string; ranAt: Date; drafts: number; totalPence: number }): Promise<void> {
    this.runs.set(run.month, run);
    return Promise.resolve();
  }
}
