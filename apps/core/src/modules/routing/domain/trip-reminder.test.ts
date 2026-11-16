import { describe, expect, it } from 'vitest';
import { reminderDue, ukHour } from './trip-reminder.js';

const at = (iso: string) => new Date(iso);

describe('reminderDue', () => {
  // November: UK time is UTC.
  const started = at('2026-11-16T09:00:00.000Z');

  it('is not due until two hours after the planned arrival', () => {
    // A 60-minute route: planned arrival 10:00, reminder from 12:00.
    expect(reminderDue(started, 60, at('2026-11-16T11:59:00.000Z'))).toBe(false);
    expect(reminderDue(started, 60, at('2026-11-16T12:00:00.000Z'))).toBe(true);
  });

  it('waits longer for a longer route', () => {
    expect(reminderDue(started, 300, at('2026-11-16T15:30:00.000Z'))).toBe(false);
    expect(reminderDue(started, 300, at('2026-11-16T16:00:00.000Z'))).toBe(true);
  });

  it('sends nothing between 21:00 and 07:00 UK time, and picks up again in the morning', () => {
    // Started 17:00 on a 60-minute route: due from 20:00.
    const evening = at('2026-11-16T17:00:00.000Z');
    expect(reminderDue(evening, 60, at('2026-11-16T20:59:00.000Z'))).toBe(true);
    expect(reminderDue(evening, 60, at('2026-11-16T21:00:00.000Z'))).toBe(false);
    expect(reminderDue(evening, 60, at('2026-11-17T03:00:00.000Z'))).toBe(false);
    expect(reminderDue(evening, 60, at('2026-11-17T06:59:00.000Z'))).toBe(false);
    expect(reminderDue(evening, 60, at('2026-11-17T07:00:00.000Z'))).toBe(true);
  });

  it('keeps the quiet hours in UK time in summer, when the UK is an hour ahead of UTC', () => {
    // 20:30 UTC on 1 July is 21:30 in the UK: quiet. 06:30 UTC is 07:30 in the UK: not.
    const s = at('2026-07-01T10:00:00.000Z');
    expect(reminderDue(s, 60, at('2026-07-01T20:30:00.000Z'))).toBe(false);
    expect(reminderDue(s, 60, at('2026-07-02T06:30:00.000Z'))).toBe(true);
  });

  it('treats a missing or negative driving time as none, never as earlier than the start', () => {
    expect(reminderDue(started, -30, at('2026-11-16T10:59:00.000Z'))).toBe(false);
    expect(reminderDue(started, 0, at('2026-11-16T11:00:00.000Z'))).toBe(true);
  });
});

describe('ukHour', () => {
  it('is UTC in winter and an hour ahead in summer', () => {
    expect(ukHour(at('2026-11-16T23:30:00.000Z'))).toBe(23);
    expect(ukHour(at('2026-07-01T23:30:00.000Z'))).toBe(0);
  });
});
