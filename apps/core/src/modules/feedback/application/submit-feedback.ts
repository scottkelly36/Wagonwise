import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import {
  validateMessage,
  type DriverId,
  type FeedbackNote,
  type InvalidMessage,
} from '../domain/feedback-note.js';
import type { FeedbackNoteRepository } from './ports/feedback-note-repository.js';

export interface SubmitFeedbackDeps {
  readonly repo: FeedbackNoteRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface SubmitFeedbackInput {
  readonly driverId: DriverId;
  readonly message: string;
  readonly appVersion: string;
  readonly deviceInfo: string;
}

export type SubmitFeedbackError = InvalidMessage;

export async function submitFeedback(
  deps: SubmitFeedbackDeps,
  input: SubmitFeedbackInput,
): Promise<Result<FeedbackNote, SubmitFeedbackError>> {
  const message = validateMessage(input.message);
  if (!message.ok) {
    return err(message.error);
  }

  const note: FeedbackNote = {
    id: makeId<'FeedbackNoteId'>(deps.ids.newId()),
    driverId: input.driverId,
    message: message.value,
    appVersion: input.appVersion,
    deviceInfo: input.deviceInfo,
    createdAt: deps.clock.now(),
  };
  await deps.repo.save(note);
  return ok(note);
}
