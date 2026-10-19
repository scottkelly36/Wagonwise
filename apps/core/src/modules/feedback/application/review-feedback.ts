import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { FeedbackNote, FeedbackNoteId } from '../domain/feedback-note.js';
import type { FeedbackFilter, FeedbackNoteRepository } from './ports/feedback-note-repository.js';

export type Forbidden = TaggedError<'Forbidden'>;
export type FeedbackNotFound = TaggedError<'FeedbackNotFound'>;

export type StaffCaller =
  | { readonly kind: 'platform' }
  | { readonly kind: 'fleet'; readonly companyId: string; readonly privileges: readonly string[] };

export interface CallerDirectory {
  getCaller(staffId: string): Promise<StaffCaller | null>;
}

/** Supplied by composition over `identity`: how a driver is named, so staff can reply to the person (their name, else the
 *  address they sign in with). An account that no longer exists has no label. */
export interface DriverLabels {
  labelsFor(driverIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

export interface ReviewFeedbackDeps {
  readonly repo: FeedbackNoteRepository;
  readonly labels: DriverLabels;
  readonly clock: Clock;
}

export interface ReviewedNote {
  readonly note: FeedbackNote;
  /** Who sent it, as a name or sign-in address. */
  readonly from: string | undefined;
}

/** The notes drivers have sent, newest first, narrowed to open or resolved, with who sent each. WagonWise staff only. */
export async function listFeedback(
  deps: Pick<ReviewFeedbackDeps, 'repo' | 'labels'>,
  caller: StaffCaller,
  input: { readonly status: FeedbackFilter; readonly limit: number },
): Promise<
  Result<{ notes: ReviewedNote[]; counts: { open: number; resolved: number } }, Forbidden>
> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const [notes, counts] = await Promise.all([
    deps.repo.list(input.status, input.limit),
    deps.repo.counts(),
  ]);
  const labels = await deps.labels.labelsFor([...new Set(notes.map((n) => n.driverId))]);
  return ok({
    notes: notes.map((note) => ({ note, from: labels.get(note.driverId) })),
    counts,
  });
}

/** Marks a note resolved, or reopens it. Doing either twice changes nothing. WagonWise staff only. */
export async function setFeedbackResolved(
  deps: Pick<ReviewFeedbackDeps, 'repo' | 'clock'>,
  caller: StaffCaller,
  id: FeedbackNoteId,
  resolved: boolean,
): Promise<Result<void, Forbidden | FeedbackNotFound>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const found = await deps.repo.setResolved(id, resolved ? deps.clock.now() : null);
  return found ? ok(undefined) : err({ tag: 'FeedbackNotFound' });
}
