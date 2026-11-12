import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  latestAnnouncement,
  listAnnouncements,
  type AnnouncementDeps,
  type StaffCaller,
} from './announcements.js';
import { InMemoryAnnouncementRepository } from './testing/in-memory-announcement-repository.js';

const platform: StaffCaller = { kind: 'platform' };
const fleet: StaffCaller = { kind: 'fleet', companyId: 'acme', privileges: ['manage_fleet'] };

function setup(): {
  deps: AnnouncementDeps;
  clock: FakeClock;
  repo: InMemoryAnnouncementRepository;
} {
  const repo = new InMemoryAnnouncementRepository();
  const clock = new FakeClock(new Date('2026-11-12T09:00:00.000Z'));
  return { deps: { announcements: repo, ids: new SequentialIdGenerator(), clock }, clock, repo };
}

describe('writing an announcement', () => {
  it('saves it with the day it was written and who wrote it, trimmed', async () => {
    const { deps } = setup();
    const result = await createAnnouncement(deps, platform, 'staff-1', {
      title: '  Route choice on jobs ',
      body: ' Start now lets you pick the route. ',
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        title: 'Route choice on jobs',
        body: 'Start now lets you pick the route.',
        publishedAt: new Date('2026-11-12T09:00:00.000Z'),
        publishedBy: 'staff-1',
      },
    });
  });

  it('is for WagonWise staff only: a fleet manager is refused and nothing is saved', async () => {
    const { deps, repo } = setup();
    const result = await createAnnouncement(deps, fleet, 'staff-2', { title: 'Hi', body: 'There' });
    expect(result).toEqual({ ok: false, error: { tag: 'Forbidden' } });
    expect(repo.items).toEqual([]);
  });

  it('refuses an empty or over-long title or message', async () => {
    const { deps, repo } = setup();
    for (const input of [
      { title: '   ', body: 'x' },
      { title: 'x', body: '' },
      { title: 'x'.repeat(81), body: 'y' },
      { title: 'x', body: 'y'.repeat(601) },
    ]) {
      expect(await createAnnouncement(deps, platform, 'staff-1', input)).toEqual({
        ok: false,
        error: { tag: 'InvalidAnnouncement' },
      });
    }
    expect(repo.items).toEqual([]);
  });
});

describe('the newest announcement, for the driver app', () => {
  it('is null when there has never been one', async () => {
    expect(await latestAnnouncement(setup().deps)).toBeNull();
  });

  it('is the one written last', async () => {
    const { deps, clock } = setup();
    await createAnnouncement(deps, platform, 'staff-1', { title: 'First', body: 'a' });
    clock.advance(60_000);
    await createAnnouncement(deps, platform, 'staff-1', { title: 'Second', body: 'b' });
    expect((await latestAnnouncement(deps))?.title).toBe('Second');
  });

  it('goes back to the one before when the newest is taken back', async () => {
    const { deps, clock } = setup();
    await createAnnouncement(deps, platform, 'staff-1', { title: 'First', body: 'a' });
    clock.advance(60_000);
    const second = await createAnnouncement(deps, platform, 'staff-1', {
      title: 'Second',
      body: 'b',
    });
    if (!second.ok) throw new Error('setup');
    await deleteAnnouncement(deps, platform, second.value.id);
    expect((await latestAnnouncement(deps))?.title).toBe('First');
  });
});

describe('listing and removing, for staff', () => {
  it('lists newest first, for WagonWise staff only', async () => {
    const { deps, clock } = setup();
    await createAnnouncement(deps, platform, 'staff-1', { title: 'First', body: 'a' });
    clock.advance(60_000);
    await createAnnouncement(deps, platform, 'staff-1', { title: 'Second', body: 'b' });

    const listed = await listAnnouncements(deps, platform);
    expect(listed.ok && listed.value.map((a) => a.title)).toEqual(['Second', 'First']);
    expect(await listAnnouncements(deps, fleet)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });

  it('removes one, says when there is none to remove, and refuses a fleet manager', async () => {
    const { deps } = setup();
    const made = await createAnnouncement(deps, platform, 'staff-1', { title: 'First', body: 'a' });
    if (!made.ok) throw new Error('setup');

    expect(await deleteAnnouncement(deps, fleet, made.value.id)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await deleteAnnouncement(deps, platform, made.value.id)).toEqual({
      ok: true,
      value: null,
    });
    expect(await deleteAnnouncement(deps, platform, made.value.id)).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
    expect(await deleteAnnouncement(deps, platform, makeId<'AnnouncementId'>('nope'))).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
  });
});
