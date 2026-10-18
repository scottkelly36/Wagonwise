import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { FeedbackNote } from '../domain/feedback-note.js';
import {
  listFeedback,
  setFeedbackResolved,
  type ReviewFeedbackDeps,
  type StaffCaller,
} from './review-feedback.js';
import { InMemoryFeedbackNoteRepository } from './testing/in-memory-feedback-note-repository.js';

const platform: StaffCaller = { kind: 'platform' };
const fleet: StaffCaller = { kind: 'fleet', companyId: 'c', privileges: ['manage_fleet'] };

function note(n: number, overrides: Partial<FeedbackNote> = {}): FeedbackNote {
  return {
    id: makeId<'FeedbackNoteId'>(`00000000-0000-4000-8000-00000000000${n}`),
    driverId: makeId<'DriverId'>(n % 2 === 0 ? 'driver-b' : 'driver-a'),
    message: `note ${n}`,
    appVersion: '1.2.1',
    deviceInfo: 'android 14',
    createdAt: new Date(`2026-10-1${n}T09:00:00.000Z`),
    ...overrides,
  };
}

function setup() {
  const repo = new InMemoryFeedbackNoteRepository();
  const asked: string[][] = [];
  const deps: ReviewFeedbackDeps = {
    repo,
    clock: new FakeClock('2026-10-18T09:00:00.000Z'),
    labels: {
      labelsFor: (ids) => {
        asked.push([...ids]);
        return Promise.resolve(new Map([['driver-a', 'Sam']]));
      },
    },
  };
  return { deps, repo, asked };
}

describe('listFeedback', () => {
  it('lists newest first with who sent each, asking for each sender once', async () => {
    const { deps, repo, asked } = setup();
    for (const n of [1, 2, 3]) await repo.save(note(n));
    const result = await listFeedback(deps, platform, { status: 'all', limit: 10 });
    expect(result.ok && result.value.notes.map((r) => [r.note.message, r.from])).toEqual([
      ['note 3', 'Sam'],
      ['note 2', undefined],
      ['note 1', 'Sam'],
    ]);
    expect(asked).toEqual([['driver-a', 'driver-b']]);
  });

  it('is for WagonWise staff only', async () => {
    const { deps } = setup();
    expect(await listFeedback(deps, fleet, { status: 'open', limit: 10 })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });
});

describe('setFeedbackResolved', () => {
  it('marks a note resolved with the time, reopens it, and says so for an unknown note', async () => {
    const { deps, repo } = setup();
    await repo.save(note(1));
    const id = note(1).id;
    expect((await setFeedbackResolved(deps, platform, id, true)).ok).toBe(true);
    expect(repo.all()[0]?.resolvedAt).toEqual(new Date('2026-10-18T09:00:00.000Z'));
    expect((await setFeedbackResolved(deps, platform, id, false)).ok).toBe(true);
    expect(repo.all()[0]?.resolvedAt).toBeUndefined();
    expect(
      await setFeedbackResolved(deps, platform, makeId<'FeedbackNoteId'>('missing'), true),
    ).toEqual({ ok: false, error: { tag: 'FeedbackNotFound' } });
  });

  it('is for WagonWise staff only', async () => {
    const { deps, repo } = setup();
    await repo.save(note(1));
    expect(await setFeedbackResolved(deps, fleet, note(1).id, true)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(repo.all()[0]?.resolvedAt).toBeUndefined();
  });
});
