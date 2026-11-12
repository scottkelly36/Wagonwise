import { describe, expect, it } from 'vitest';

import {
  announcementListResponseSchema,
  announcementPreferenceSchema,
  announcementSchema,
  publishAnnouncementResponseSchema,
  createAnnouncementRequestSchema,
  latestAnnouncementResponseSchema,
} from './announcements.js';

const announcement = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Route choice on jobs',
  body: 'Start on a job now lets you pick the route.\nTolls are shown on each one.',
  publishedAt: '2026-11-12T09:00:00.000Z',
};

describe('announcements', () => {
  it('trims what staff write and refuses an empty title or message', () => {
    const parsed = createAnnouncementRequestSchema.safeParse({ title: '  Hello  ', body: ' Hi ' });
    expect(parsed.success && parsed.data).toEqual({ title: 'Hello', body: 'Hi' });
    expect(createAnnouncementRequestSchema.safeParse({ title: '   ', body: 'x' }).success).toBe(
      false,
    );
    expect(createAnnouncementRequestSchema.safeParse({ title: 'x', body: '' }).success).toBe(false);
  });

  it('refuses a title or message too long for a card or a notification', () => {
    expect(
      createAnnouncementRequestSchema.safeParse({ title: 'x'.repeat(81), body: 'y' }).success,
    ).toBe(false);
    expect(
      createAnnouncementRequestSchema.safeParse({ title: 'x', body: 'y'.repeat(601) }).success,
    ).toBe(false);
  });

  it('answers the app with the newest announcement or null', () => {
    expect(latestAnnouncementResponseSchema.safeParse({ announcement }).success).toBe(true);
    expect(latestAnnouncementResponseSchema.safeParse({ announcement: null }).success).toBe(true);
    expect(latestAnnouncementResponseSchema.safeParse({}).success).toBe(false);
  });

  it('lists announcements for the portal', () => {
    expect(
      announcementListResponseSchema.safeParse({ announcements: [announcement] }).success,
    ).toBe(true);
  });
});

describe('sending a note as a notification', () => {
  it('is only asked for when staff choose to', () => {
    expect(createAnnouncementRequestSchema.safeParse({ title: 'x', body: 'y' }).success).toBe(true);
    const parsed = createAnnouncementRequestSchema.safeParse({ title: 'x', body: 'y', push: true });
    expect(parsed.success && parsed.data.push).toBe(true);
    expect(
      createAnnouncementRequestSchema.safeParse({ title: 'x', body: 'y', push: 'yes' }).success,
    ).toBe(false);
  });

  it('says when and to how many phones it was sent, and when that failed', () => {
    const sent = { ...announcement, pushedAt: '2026-11-12T09:01:00.000Z', pushedTo: 12 };
    expect(announcementListResponseSchema.safeParse({ announcements: [sent] }).success).toBe(true);
    expect(
      publishAnnouncementResponseSchema.safeParse({ ...announcement, pushFailed: true }).success,
    ).toBe(true);
    expect(announcementSchema.safeParse({ ...announcement, pushedTo: -1 }).success).toBe(false);
  });

  it('holds a driver’s choice as a plain on or off', () => {
    expect(announcementPreferenceSchema.safeParse({ pushes: false }).success).toBe(true);
    expect(announcementPreferenceSchema.safeParse({}).success).toBe(false);
  });
});
