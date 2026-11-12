import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { PUSH_BODY_MAX, PUSH_COOLDOWN_MS, pushMessageFor } from '../domain/announcement.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  getPushPreference,
  latestAnnouncement,
  listAnnouncements,
  setPushPreference,
  type AnnouncementDeps,
  type StaffCaller,
} from './announcements.js';
import {
  FakeAnnouncementAudience,
  FakeAnnouncementPusher,
  InMemoryAnnouncementRepository,
  InMemoryPushPreferences,
} from './testing/in-memory-announcement-repository.js';

const platform: StaffCaller = { kind: 'platform' };
const fleet: StaffCaller = { kind: 'fleet', companyId: 'acme', privileges: ['manage_fleet'] };

function setup() {
  const repo = new InMemoryAnnouncementRepository();
  const clock = new FakeClock(new Date('2026-11-12T09:00:00.000Z'));
  const audience = new FakeAnnouncementAudience();
  const pusher = new FakeAnnouncementPusher();
  const preferences = new InMemoryPushPreferences();
  const deps: AnnouncementDeps = {
    announcements: repo,
    ids: new SequentialIdGenerator(),
    clock,
    audience,
    pusher,
    preferences,
  };
  return { deps, clock, repo, audience, pusher, preferences };
}

const note = { title: 'Choose your route on a job', body: 'Start on a job opens the route cards.' };

async function published(
  deps: AnnouncementDeps,
  input: { title: string; body: string; push?: boolean } = note,
) {
  const result = await createAnnouncement(deps, platform, 'staff-1', input);
  if (!result.ok) throw new Error(`setup: ${result.error.tag}`);
  return result.value;
}

describe('writing an announcement', () => {
  it('saves it with the day it was written and who wrote it, trimmed', async () => {
    const { deps } = setup();
    const { announcement } = await published(deps, {
      title: '  Route choice on jobs ',
      body: ' Start now lets you pick the route. ',
    });
    expect(announcement).toMatchObject({
      title: 'Route choice on jobs',
      body: 'Start now lets you pick the route.',
      publishedAt: new Date('2026-11-12T09:00:00.000Z'),
      publishedBy: 'staff-1',
    });
    expect(announcement.pushedAt).toBeUndefined();
  });

  it('is for WagonWise staff only: a fleet manager is refused and nothing is saved', async () => {
    const { deps, repo } = setup();
    const result = await createAnnouncement(deps, fleet, 'staff-2', { ...note, push: true });
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

describe('sending it as a notification', () => {
  it('sends the heading and the first point to every phone of a driver who has not turned them off, and records it', async () => {
    const { deps, audience, pusher, preferences, clock } = setup();
    audience.targets = [
      { driverId: 'd1', pushToken: 'token-1a' },
      { driverId: 'd1', pushToken: 'token-1b' },
      { driverId: 'd2', pushToken: 'token-2' },
      { driverId: 'd3', pushToken: 'token-3' },
    ];
    await setPushPreference(deps, 'd3', false);
    expect(preferences.optedOut.has('d3')).toBe(true);

    const { announcement, pushFailed } = await published(deps, {
      title: 'Choose your route on a job',
      body: 'Start on a job opens the route cards.\nTolls are shown on each one.',
      push: true,
    });

    expect(pusher.sent).toHaveLength(1);
    expect(pusher.sent[0]?.tokens).toEqual(['token-1a', 'token-1b', 'token-2']);
    expect(pusher.sent[0]?.message).toEqual({
      title: 'Choose your route on a job',
      body: 'Start on a job opens the route cards.',
      data: { type: 'announcement', announcementId: announcement.id },
    });
    expect(pushFailed).toBeUndefined();
    expect(announcement).toMatchObject({ pushedAt: clock.now(), pushedTo: 3 });
  });

  it('says how many phones the push service took, not how many it was handed', async () => {
    const { deps, audience, pusher } = setup();
    audience.targets = [
      { driverId: 'd1', pushToken: 'a' },
      { driverId: 'd2', pushToken: 'b' },
    ];
    pusher.acceptOnly = 1;
    expect((await published(deps, { ...note, push: true })).announcement.pushedTo).toBe(1);
  });

  it('sends one message to a phone that shows up twice', async () => {
    const { deps, audience, pusher } = setup();
    audience.targets = [
      { driverId: 'd1', pushToken: 'same' },
      { driverId: 'd2', pushToken: 'same' },
    ];
    await published(deps, { ...note, push: true });
    expect(pusher.sent[0]?.tokens).toEqual(['same']);
  });

  it('does not send one unless staff ask for it', async () => {
    const { deps, audience, pusher } = setup();
    audience.targets = [{ driverId: 'd1', pushToken: 'a' }];
    await published(deps, note);
    expect(pusher.sent).toEqual([]);
  });

  it('is refused, with nothing saved, when one went out in the last three days', async () => {
    const { deps, audience, clock, repo } = setup();
    audience.targets = [{ driverId: 'd1', pushToken: 'a' }];
    await published(deps, { ...note, push: true });

    clock.advance(PUSH_COOLDOWN_MS - 1000);
    expect(await createAnnouncement(deps, platform, 'staff-1', { ...note, push: true })).toEqual({
      ok: false,
      error: { tag: 'PushTooSoon' },
    });
    expect(repo.items).toHaveLength(1);

    clock.advance(1000);
    expect((await published(deps, { ...note, push: true })).announcement.pushedTo).toBe(1);
  });

  it('still lets a note be published, with no notification, inside those three days', async () => {
    const { deps, audience, clock } = setup();
    audience.targets = [{ driverId: 'd1', pushToken: 'a' }];
    await published(deps, { ...note, push: true });
    clock.advance(60_000);
    const second = await published(deps, { title: 'Another', body: 'Quiet one' });
    expect(second.announcement.pushedAt).toBeUndefined();
  });

  it('sends nothing, and does not use up the limit, when nobody has notifications on', async () => {
    const { deps, audience, pusher, clock } = setup();
    audience.targets = [{ driverId: 'd1', pushToken: 'a' }];
    await setPushPreference(deps, 'd1', false);

    const first = await published(deps, { ...note, push: true });
    expect(pusher.sent).toEqual([]);
    expect(first.announcement).toMatchObject({ pushedTo: 0 });
    expect(first.announcement.pushedAt).toBeUndefined();

    clock.advance(60_000);
    await setPushPreference(deps, 'd1', true);
    expect((await published(deps, { ...note, push: true })).announcement.pushedTo).toBe(1);
  });

  it('keeps the note when the notification cannot be sent, says so, and does not use up the limit', async () => {
    const { deps, audience, pusher, clock, repo } = setup();
    audience.targets = [{ driverId: 'd1', pushToken: 'a' }];
    pusher.fail = true;

    const failed = await published(deps, { ...note, push: true });
    expect(failed.pushFailed).toBe(true);
    expect(failed.announcement.pushedAt).toBeUndefined();
    expect(repo.items).toHaveLength(1);

    pusher.fail = false;
    clock.advance(60_000);
    expect((await published(deps, { ...note, push: true })).announcement.pushedTo).toBe(1);
  });
});

describe('the notification text', () => {
  const id = makeId<'AnnouncementId'>('a1');

  it('is the heading and the first point, with the note’s id for the app', () => {
    expect(pushMessageFor({ id, title: 'Heading', body: '\n\n  First point \nSecond' })).toEqual({
      title: 'Heading',
      body: 'First point',
      data: { type: 'announcement', announcementId: 'a1' },
    });
  });

  it('cuts a long first point to fit a phone, with an ellipsis', () => {
    const message = pushMessageFor({ id, title: 'Heading', body: 'word '.repeat(60) });
    expect(message.body.length).toBeLessThanOrEqual(PUSH_BODY_MAX);
    expect(message.body.endsWith('…')).toBe(true);
  });
});

describe('a driver’s choice about notifications', () => {
  it('is on until they turn it off, and can be turned back on', async () => {
    const { deps } = setup();
    expect(await getPushPreference(deps, 'd1')).toBe(true);
    await setPushPreference(deps, 'd1', false);
    expect(await getPushPreference(deps, 'd1')).toBe(false);
    expect(await getPushPreference(deps, 'd2')).toBe(true);
    await setPushPreference(deps, 'd1', true);
    expect(await getPushPreference(deps, 'd1')).toBe(true);
  });
});

describe('the newest announcement, for the driver app', () => {
  it('is null when there has never been one', async () => {
    expect(await latestAnnouncement(setup().deps)).toBeNull();
  });

  it('is the one written last, and goes back to the one before when it is taken back', async () => {
    const { deps, clock } = setup();
    await published(deps, { title: 'First', body: 'a' });
    clock.advance(60_000);
    const second = await published(deps, { title: 'Second', body: 'b' });
    expect((await latestAnnouncement(deps))?.title).toBe('Second');
    await deleteAnnouncement(deps, platform, second.announcement.id);
    expect((await latestAnnouncement(deps))?.title).toBe('First');
  });
});

describe('listing and removing, for staff', () => {
  it('lists newest first, for WagonWise staff only', async () => {
    const { deps, clock } = setup();
    await published(deps, { title: 'First', body: 'a' });
    clock.advance(60_000);
    await published(deps, { title: 'Second', body: 'b' });

    const listed = await listAnnouncements(deps, platform);
    expect(listed.ok && listed.value.map((a) => a.title)).toEqual(['Second', 'First']);
    expect(await listAnnouncements(deps, fleet)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });

  it('removes one, says when there is none to remove, and refuses a fleet manager', async () => {
    const { deps } = setup();
    const made = await published(deps, { title: 'First', body: 'a' });
    const id = made.announcement.id;

    expect(await deleteAnnouncement(deps, fleet, id)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await deleteAnnouncement(deps, platform, id)).toEqual({ ok: true, value: null });
    expect(await deleteAnnouncement(deps, platform, id)).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
    expect(await deleteAnnouncement(deps, platform, makeId<'AnnouncementId'>('nope'))).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
  });
});
