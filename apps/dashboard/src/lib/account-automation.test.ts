import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_OPTIONS,
  FULL_AUTOMATION_WARNING,
  historyLines,
  runSummary,
} from './account-automation';

describe('AUTOMATION_OPTIONS', () => {
  it('offers the three modes the server knows, off first', () => {
    expect(AUTOMATION_OPTIONS.map((o) => o.value)).toEqual(['off', 'no_pause', 'full']);
  });

  it('warns before pausing by itself is switched on', () => {
    expect(FULL_AUTOMATION_WARNING).toContain('without anyone pressing anything');
    expect(FULL_AUTOMATION_WARNING).toContain('Never pause');
  });
});

describe('runSummary', () => {
  it('says what a pass did, and that nothing needed doing', () => {
    expect(runSummary({ moved: 1, emailed: 2, nobodyToWrite: 0, failed: 0 })).toBe(
      '1 moved, 2 emailed.',
    );
    expect(runSummary({ moved: 0, emailed: 0, nobodyToWrite: 1, failed: 1 })).toBe(
      '1 with nobody to write to, 1 failed.',
    );
    expect(runSummary({ moved: 0, emailed: 0, nobodyToWrite: 0, failed: 0 })).toContain(
      'Nothing needed doing',
    );
  });
});

describe('historyLines', () => {
  it('puts moves and emails together, newest first, and says who made a move', () => {
    const lines = historyLines({
      moves: [
        {
          from: 'trial',
          to: 'overdue',
          automatic: true,
          note: 'Automatic: the free period ended',
          at: '2026-12-01T09:00:00.000Z',
        },
        {
          from: 'overdue',
          to: 'active',
          automatic: false,
          note: '',
          at: '2026-12-05T10:00:00.000Z',
        },
      ],
      emails: [
        { kind: 'overdue', occasion: '2026-12-01', at: '2026-12-01T09:00:05.000Z', recipients: 2 },
      ],
    });
    expect(lines).toHaveLength(3);
    expect(lines[0]?.text).toContain('overdue to active, by hand');
    expect(lines[1]?.text).toBe('1 Dec 2026, 09:00: emailed "Payment overdue" to 2 people');
    expect(lines[2]?.text).toContain(
      'free trial to overdue, by the rules (Automatic: the free period ended)',
    );
  });

  it('says one person for one, and is empty when nothing has happened', () => {
    expect(
      historyLines({
        moves: [],
        emails: [
          { kind: 'paused', occasion: '2026-12-01', at: '2026-12-01T09:00:00.000Z', recipients: 1 },
        ],
      })[0]?.text,
    ).toContain('to 1 person');
    expect(historyLines({ moves: [], emails: [] })).toEqual([]);
  });
});
