import { afterTrip, shouldAskForReview, ukDay } from './review-prompt';

const at = (iso: string) => new Date(iso);
const empty = { tripDays: [], lastAskedAt: null };

it('waits until trips have ended on two different days', () => {
  const one = afterTrip(empty, at('2026-11-20T10:00:00Z'));
  expect(shouldAskForReview(one, at('2026-11-20T10:00:00Z'))).toBe(false);
  const sameDay = afterTrip(one, at('2026-11-20T18:00:00Z'));
  expect(sameDay.tripDays).toEqual(['2026-11-20']);
  expect(shouldAskForReview(sameDay, at('2026-11-20T18:00:00Z'))).toBe(false);
  const two = afterTrip(sameDay, at('2026-11-21T09:00:00Z'));
  expect(shouldAskForReview(two, at('2026-11-21T09:00:00Z'))).toBe(true);
});

it('asks again only after 120 days', () => {
  const state = { tripDays: ['2026-01-01', '2026-01-02'], lastAskedAt: '2026-11-01T10:00:00.000Z' };
  expect(shouldAskForReview(state, at('2027-01-01T10:00:00Z'))).toBe(false);
  expect(shouldAskForReview(state, at('2027-03-02T10:00:00Z'))).toBe(true);
});

it('uses the UK day, so just after midnight in summer is the next day', () => {
  expect(ukDay(at('2026-07-01T23:30:00Z'))).toBe('2026-07-02');
  expect(ukDay(at('2026-12-01T23:30:00Z'))).toBe('2026-12-01');
});
