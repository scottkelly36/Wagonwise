import { describe, expect, it } from 'vitest';
import { acceptableTime, FLOW_EVENT_RETENTION_DAYS } from './flow-event.js';

const now = new Date('2026-11-17T12:00:00.000Z');
const minutes = (m: number) => new Date(now.getTime() + m * 60 * 1000);

describe('acceptableTime', () => {
  it('accepts the last day and up to five minutes ahead (a phone clock a little fast)', () => {
    expect(acceptableTime(minutes(0), now)).toBe(true);
    expect(acceptableTime(minutes(-24 * 60), now)).toBe(true);
    expect(acceptableTime(minutes(5), now)).toBe(true);
  });

  it('refuses anything older than a day, further ahead, or not a time at all', () => {
    expect(acceptableTime(minutes(-24 * 60 - 1), now)).toBe(false);
    expect(acceptableTime(minutes(6), now)).toBe(false);
    expect(acceptableTime(new Date('not a date'), now)).toBe(false);
  });
});

it('keeps flow events no longer than the owner decided: 90 days', () => {
  expect(FLOW_EVENT_RETENTION_DAYS).toBe(90);
});
