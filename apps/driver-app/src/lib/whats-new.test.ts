import type { AnnouncementDto } from '@wagonwise/contracts/announcements';

import { shouldShowWhatsNew, WHATS_NEW_MAX_AGE_DAYS, whatsNewPoints } from './whats-new';

const now = new Date('2026-11-12T12:00:00.000Z');
const note = (publishedAt = '2026-11-12T09:00:00.000Z'): AnnouncementDto => ({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Choose your route on a job',
  body: 'Start on a job now lets you pick the route.',
  publishedAt,
});

describe('shouldShowWhatsNew', () => {
  it('shows a recent note this driver has not seen', () => {
    expect(
      shouldShowWhatsNew({ announcement: note(), seenId: undefined, updateWaiting: false, now }),
    ).toBe(true);
  });

  it('shows the next note to someone who has seen an earlier one', () => {
    expect(
      shouldShowWhatsNew({ announcement: note(), seenId: 'earlier', updateWaiting: false, now }),
    ).toBe(true);
  });

  it('does not show a note again once it has been seen', () => {
    expect(
      shouldShowWhatsNew({ announcement: note(), seenId: note().id, updateWaiting: false, now }),
    ).toBe(false);
  });

  it('shows nothing when there is no note', () => {
    for (const announcement of [null, undefined]) {
      expect(
        shouldShowWhatsNew({ announcement, seenId: undefined, updateWaiting: false, now }),
      ).toBe(false);
    }
  });

  it('waits while an update is still to be restarted into, since the note may be about it', () => {
    expect(
      shouldShowWhatsNew({ announcement: note(), seenId: undefined, updateWaiting: true, now }),
    ).toBe(false);
  });

  it('does not show a note that is no longer news, so a driver who installs later is not told about old changes', () => {
    const old = new Date(now.getTime() - (WHATS_NEW_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000);
    const recent = new Date(now.getTime() - (WHATS_NEW_MAX_AGE_DAYS - 1) * 24 * 60 * 60 * 1000);
    expect(
      shouldShowWhatsNew({
        announcement: note(old.toISOString()),
        seenId: undefined,
        updateWaiting: false,
        now,
      }),
    ).toBe(false);
    expect(
      shouldShowWhatsNew({
        announcement: note(recent.toISOString()),
        seenId: undefined,
        updateWaiting: false,
        now,
      }),
    ).toBe(true);
  });

  it('does not show a note whose date cannot be read', () => {
    expect(
      shouldShowWhatsNew({
        announcement: note('not a date'),
        seenId: undefined,
        updateWaiting: false,
        now,
      }),
    ).toBe(false);
  });
});

describe('whatsNewPoints', () => {
  it('splits a note into its points, one to a line, dropping blanks and padding', () => {
    expect(whatsNewPoints('  First point \n\n Second point\n   \nThird')).toEqual([
      'First point',
      'Second point',
      'Third',
    ]);
  });
});
