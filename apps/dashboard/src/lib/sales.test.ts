import type { EntryDto, ProspectDto } from '@wagonwise/contracts/sales';
import { describe, expect, it } from 'vitest';

import {
  contactHint,
  dueToday,
  isActive,
  localDateString,
  pitchSummary,
  readFirmsCsv,
  weekStart,
  weeklyCounts,
} from './sales';

const prospect = (over: Partial<ProspectDto> & { id: string }): ProspectDto => ({
  name: `Firm ${over.id}`,
  legalForm: 'limited',
  relationship: 'new',
  stage: 'not_contacted',
  createdAt: '2026-11-01T09:00:00.000Z',
  ...over,
});

const entry = (over: Partial<EntryDto> & { id: string; prospectId: string }): EntryDto => ({
  at: '2026-11-09T10:00:00.000Z',
  how: 'email',
  result: 'sent',
  ...over,
});

// Sunday 8 November 2026, midday local time.
const NOW = new Date(2026, 10, 8, 12, 0, 0);
const at = (y: number, m: number, d: number, h = 10): string =>
  new Date(y, m - 1, d, h).toISOString();

describe('weekStart', () => {
  it('is the Monday at midnight, local time, even from a Sunday', () => {
    expect(localDateString(weekStart(NOW))).toBe('2026-11-02');
    expect(localDateString(weekStart(new Date(2026, 10, 9, 8)))).toBe('2026-11-09');
    expect(weekStart(NOW).getHours()).toBe(0);
  });
});

describe('contactHint', () => {
  it('says phone only for a sole trader or partnership', () => {
    expect(contactHint(prospect({ id: '1', legalForm: 'sole_trader_or_partnership' }))).toMatch(
      /phone only/i,
    );
  });
  it('allows the company mailbox for a limited company, with the reminder to say who you are', () => {
    expect(contactHint(prospect({ id: '1', legalForm: 'limited' }))).toMatch(/opt out/);
  });
  it('asks for a Companies House check when the form is not known', () => {
    expect(contactHint(prospect({ id: '1', legalForm: 'unknown' }))).toMatch(/Companies House/);
  });
  it('holds big fleets back, and a firm that opted out above everything', () => {
    expect(contactHint(prospect({ id: '1', fleetSize: 100 }))).toMatch(/big fleet/i);
    expect(contactHint(prospect({ id: '1', fleetSize: 500, stage: 'do_not_contact' }))).toMatch(
      /do not contact/i,
    );
  });
});

describe('weeklyCounts', () => {
  it('counts firms first reached this week, not follow-ups or earlier firms', () => {
    const counts = weeklyCounts(
      [
        entry({ id: 'a', prospectId: 'p1', at: at(2026, 11, 3) }),
        entry({ id: 'b', prospectId: 'p1', at: at(2026, 11, 5) }),
        entry({ id: 'c', prospectId: 'p2', at: at(2026, 11, 4) }),
        // First reached last week, followed up this week: not a new firm.
        entry({ id: 'd', prospectId: 'p3', at: at(2026, 10, 28) }),
        entry({ id: 'e', prospectId: 'p3', at: at(2026, 11, 5) }),
      ],
      NOW,
    );
    expect(counts.contacted).toBe(2);
  });

  it('counts each result once per firm and ignores other weeks', () => {
    const counts = weeklyCounts(
      [
        entry({ id: 'a', prospectId: 'p1', result: 'replied', at: at(2026, 11, 3) }),
        entry({ id: 'b', prospectId: 'p1', result: 'replied', at: at(2026, 11, 4) }),
        entry({ id: 'c', prospectId: 'p2', result: 'conversation', at: at(2026, 11, 4) }),
        entry({ id: 'd', prospectId: 'p3', result: 'demo', at: at(2026, 11, 6) }),
        entry({ id: 'e', prospectId: 'p4', result: 'demo', at: at(2026, 10, 30) }),
      ],
      NOW,
    );
    expect(counts).toMatchObject({ replied: 1, conversations: 1, demos: 1 });
  });

  it('counts pilots over the calendar month', () => {
    const counts = weeklyCounts(
      [
        entry({ id: 'a', prospectId: 'p1', result: 'pilot', at: at(2026, 11, 1) }),
        entry({ id: 'b', prospectId: 'p2', result: 'pilot', at: at(2026, 10, 31) }),
      ],
      NOW,
    );
    expect(counts.pilotsThisMonth).toBe(1);
  });
});

describe('dueToday', () => {
  const firm = prospect({ id: 'p1', stage: 'contacted' });

  it('asks for one follow-up seven days after the first message with no reply', () => {
    const due = dueToday([firm], [entry({ id: 'a', prospectId: 'p1', at: at(2026, 11, 1) })], NOW);
    expect(due).toHaveLength(1);
    expect(due[0]?.reason).toMatch(/follow-up is due/);
  });

  it('waits until seven days have passed', () => {
    expect(
      dueToday([firm], [entry({ id: 'a', prospectId: 'p1', at: at(2026, 11, 3) })], NOW),
    ).toEqual([]);
  });

  it('leaves a firm alone once it has had its follow-up', () => {
    const entries = [
      entry({ id: 'a', prospectId: 'p1', at: at(2026, 10, 20) }),
      entry({ id: 'b', prospectId: 'p1', at: at(2026, 10, 28) }),
    ];
    expect(dueToday([firm], entries, NOW)).toEqual([]);
  });

  it('shows a next step whose day has come, and puts it in place of the follow-up', () => {
    const withStep = prospect({
      id: 'p1',
      stage: 'contacted',
      nextStep: 'Ring back',
      nextStepOn: '2026-11-08',
    });
    const due = dueToday(
      [withStep],
      [entry({ id: 'a', prospectId: 'p1', at: at(2026, 10, 20) })],
      NOW,
    );
    expect(due).toHaveLength(1);
    expect(due[0]?.reason).toMatch(/Ring back \(due today\)/);
  });

  it('does not show a next step still in the future', () => {
    const later = prospect({
      id: 'p1',
      stage: 'replied',
      nextStep: 'Demo',
      nextStepOn: '2026-11-12',
    });
    expect(dueToday([later], [], NOW)).toEqual([]);
  });

  it('never shows a firm that said no, opted out or is paying', () => {
    const overdue = { nextStep: 'Ring', nextStepOn: '2026-11-01' };
    for (const stage of ['not_interested', 'do_not_contact', 'paying'] as const) {
      expect(isActive(stage)).toBe(false);
      expect(dueToday([prospect({ id: 'p1', stage, ...overdue })], [], NOW)).toEqual([]);
    }
  });
});

describe('pitchSummary', () => {
  it('counts firms per pitch and how many of them replied, most used first', () => {
    const rows = pitchSummary([
      entry({ id: 'a', prospectId: 'p1', pitch: 'checks' }),
      entry({ id: 'b', prospectId: 'p2', pitch: 'checks' }),
      entry({ id: 'c', prospectId: 'p2', result: 'replied' }),
      entry({ id: 'd', prospectId: 'p3', pitch: 'proof_of_delivery' }),
      entry({ id: 'e', prospectId: 'p3', pitch: 'proof_of_delivery' }),
      entry({ id: 'f', prospectId: 'p4' }),
    ]);
    expect(rows).toEqual([
      { pitch: 'checks', firms: 2, replied: 1 },
      { pitch: 'proof_of_delivery', firms: 1, replied: 0 },
    ]);
  });
});

describe('readFirmsCsv', () => {
  it('finds the columns by heading, in any order', () => {
    const parsed = readFirmsCsv(
      'Town,Name,Fleet size,Legal form,Relationship,Phone,Next step\n' +
        'Hexham,Hubbuck Ltd,4,limited,warm,01434 602417,Ring about checks\n',
    );
    expect(parsed.problem).toBeUndefined();
    expect(parsed.rows).toEqual([
      {
        name: 'Hubbuck Ltd',
        town: 'Hexham',
        fleetSize: '4',
        legalForm: 'limited',
        relationship: 'warm',
        phone: '01434 602417',
        nextStep: 'Ring about checks',
      },
    ]);
  });

  it('splits a spreadsheet’s contact-details cell into a phone and a mailbox', () => {
    const parsed = readFirmsCsv(
      'Company,Contact details (public)\n' +
        '"Colin Willis Haulage Ltd","01207 560 585; traffic@colinwillishaulage.co.uk"\n' +
        'N & J Bell Ltd,Via directories\n',
    );
    expect(parsed.rows[0]).toMatchObject({
      phone: '01207 560 585',
      email: 'traffic@colinwillishaulage.co.uk',
    });
    expect(parsed.rows[1]).toEqual({ name: 'N & J Bell Ltd' });
  });

  it('skips rows with no name and says when a file cannot be used', () => {
    expect(readFirmsCsv('Name,Town\n,Hexham\nAcme,\n').rows).toEqual([{ name: 'Acme' }]);
    expect(readFirmsCsv('').problem).toMatch(/empty/);
    expect(readFirmsCsv('Town,Phone\nHexham,01\n').problem).toMatch(/Name/);
    expect(readFirmsCsv('Name\n').problem).toMatch(/No firms/);
  });
});
