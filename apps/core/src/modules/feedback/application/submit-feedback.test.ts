import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { submitFeedback, type SubmitFeedbackDeps } from './submit-feedback.js';
import { InMemoryFeedbackNoteRepository } from './testing/in-memory-feedback-note-repository.js';

const driverId = makeId<'DriverId'>('driver-1');
const now = new Date('2026-06-15T08:00:00.000Z');

function buildDeps(): SubmitFeedbackDeps {
  return {
    repo: new InMemoryFeedbackNoteRepository(),
    clock: new FakeClock(now),
    ids: new SequentialIdGenerator(),
  };
}

describe('submitFeedback', () => {
  it('creates and persists a note with a generated id', async () => {
    const deps = buildDeps();
    const result = await submitFeedback(deps, {
      driverId,
      message: '  The route to Corbridge avoided a bridge that was fine  ',
      appVersion: '1.0.0',
      deviceInfo: 'ios 17.2',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        id: '00000000-0000-4000-8000-000000000001',
        driverId,
        message: 'The route to Corbridge avoided a bridge that was fine', // trimmed
        appVersion: '1.0.0',
        deviceInfo: 'ios 17.2',
        createdAt: now,
      },
    });

    const repo = deps.repo as InMemoryFeedbackNoteRepository;
    expect(repo.all()).toEqual([result.ok && result.value]);
  });

  it('rejects a blank message without touching the repository', async () => {
    const deps = buildDeps();
    const result = await submitFeedback(deps, {
      driverId,
      message: '   ',
      appVersion: '1.0.0',
      deviceInfo: 'ios 17.2',
    });
    expect(result).toEqual({ ok: false, error: { tag: 'InvalidMessage' } });
    expect((deps.repo as InMemoryFeedbackNoteRepository).all()).toEqual([]);
  });
});
