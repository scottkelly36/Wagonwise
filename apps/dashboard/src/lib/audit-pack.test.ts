import type { AuditPackDto } from '@wagonwise/contracts/audit';
import { describe, expect, it } from 'vitest';

import {
  statusSteps,
  auditCsv,
  auditCsvFileName,
  auditPackHtml,
  dateTimeText,
  dayText,
  presetRange,
  rangeProblem,
  summaryLines,
} from './audit-pack';

const PACK: AuditPackDto = {
  vehicle: { id: 'v1', name: 'Scania R450', registration: 'NX21ABC', company: 'Acme Haulage' },
  range: { from: '2026-10-01', to: '2026-11-08' },
  generatedAt: '2026-11-08T12:00:00.000Z',
  summary: {
    checks: 2,
    clear: 1,
    advisory: 0,
    doNotDrive: 1,
    defectsFound: 1,
    defectsNotFixed: 1,
    maintenanceDone: 1,
    maintenanceOverdue: 1,
    dueDatesChanged: 1,
  },
  checks: [
    {
      id: 'c1',
      submittedAt: '2026-11-03T06:30:00.000Z',
      day: '2026-11-03',
      list: 'Daily walk-round',
      listVersion: 3,
      who: 'Sam Driver',
      result: 'do_not_drive',
      defects: 1,
    },
  ],
  defects: [
    {
      id: 'd1',
      foundAt: '2026-11-03T06:31:00.000Z',
      foundBy: 'Sam Driver',
      item: 'Brake light',
      severity: 'do_not_drive',
      detail: 'Not working',
      status: 'fixed',
      lastChangeAt: '2026-11-04T10:00:00.000Z',
      lastChangeBy: 'Pat Office',
      history: [
        { status: 'acknowledged', at: '2026-11-03T09:00:00.000Z', by: 'Pat Office' },
        { status: 'fixed', at: '2026-11-04T10:00:00.000Z', by: 'Pat Office' },
      ],
      repair: {
        title: 'Replace brake light',
        dueDate: '2026-11-04',
        status: 'done',
        doneOn: '2026-11-04',
        finishedBy: 'Pat Office',
        note: 'New bulb',
      },
    },
  ],
  maintenance: {
    items: [{ name: 'MOT', dueDate: '2026-10-01', lastDone: '2025-10-01', state: 'overdue' }],
    done: [
      {
        item: 'Safety inspection',
        doneOn: '2026-11-01',
        nextDue: '2027-01-10',
        by: 'Pat Office',
        note: 'Passed',
        recordedAt: '2026-11-01T15:00:00.000Z',
      },
    ],
    changes: [
      {
        item: 'MOT',
        from: '2026-09-01',
        to: '2026-10-01',
        at: '2026-10-05T09:00:00.000Z',
        by: 'Pat Office',
      },
    ],
  },
  timeline: [
    {
      at: '2026-11-01T12:00:00.000Z',
      kind: 'maintenance_done',
      title: 'Safety inspection done on 2026-11-01',
      detail: 'Next due 2027-01-10 · Passed',
      who: 'Pat Office',
    },
    {
      at: '2026-11-03T06:30:00.000Z',
      kind: 'check',
      title: 'Walk-round check, Daily walk-round: do not drive',
      detail: '1 defect found',
      who: 'Sam Driver',
    },
  ],
};

describe('presetRange', () => {
  it('ends today in UK time and starts that many days back, today included', () => {
    expect(presetRange('last12', new Date('2026-11-08T12:00:00.000Z'))).toEqual({
      from: '2025-11-09',
      to: '2026-11-08',
    });
    expect(presetRange('last3', new Date('2026-11-08T12:00:00.000Z'))).toEqual({
      from: '2026-08-10',
      to: '2026-11-08',
    });
  });

  it('is still the UK day just after midnight in summer', () => {
    expect(presetRange('last3', new Date('2026-07-01T23:30:00.000Z')).to).toBe('2026-07-02');
  });
});

describe('rangeProblem', () => {
  it('accepts a sensible range and says why it refuses the others', () => {
    expect(rangeProblem('2026-01-01', '2026-11-08')).toBeUndefined();
    expect(rangeProblem('', '2026-11-08')).toMatch(/both dates/);
    expect(rangeProblem('2026-11-08', '2026-01-01')).toMatch(/on or before/);
    expect(rangeProblem('2023-01-01', '2026-11-08')).toMatch(/two years/);
  });
});

describe('the spreadsheet', () => {
  it('has one line per event, with the day alone for maintenance and the UK time for the rest', () => {
    const lines = auditCsv(PACK).replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('When,Record,What,Detail,Who');
    expect(lines[1]).toBe(
      '1 Nov 2026,Maintenance done,Safety inspection done on 2026-11-01,Next due 2027-01-10 · Passed,Pat Office',
    );
    expect(lines[2]).toBe(
      '"3 Nov 2026, 06:30",Check,"Walk-round check, Daily walk-round: do not drive",1 defect found,Sam Driver',
    );
    expect(lines).toHaveLength(3);
  });

  it('stops a typed note being read as a formula by a spreadsheet', () => {
    const csv = auditCsv({
      ...PACK,
      timeline: [
        {
          at: '2026-11-03T06:30:00.000Z',
          kind: 'defect_found',
          title: 'Defect found: Horn',
          detail: '=HYPERLINK("http://example.test")',
          who: 'Sam',
        },
      ],
    });
    expect(csv).toContain(`"'=HYPERLINK(""http://example.test"")"`);
  });

  it('is named for the registration and the period', () => {
    expect(auditCsvFileName(PACK)).toBe('wagonwise-audit-nx21abc-2026-10-01-to-2026-11-08.csv');
    const noRegistration = { id: 'v2', name: 'Old Blue / Tipper' };
    expect(auditCsvFileName({ ...PACK, vehicle: noRegistration })).toBe(
      'wagonwise-audit-old-blue-tipper-2026-10-01-to-2026-11-08.csv',
    );
  });
});

describe('summaryLines', () => {
  it('says the counts in sentences, with the right singular and plural', () => {
    expect(summaryLines(PACK)).toEqual([
      'Walk-round checks: 2 (1 all clear, 0 fix soon, 1 do not drive).',
      'Defects found in this period: 1. 1 defect is not marked fixed (older ones included).',
      'Maintenance recorded as done: 1. 1 item is overdue today.',
      'Due dates entered or corrected by hand in this period: 1.',
    ]);
    expect(
      summaryLines({
        ...PACK,
        summary: { ...PACK.summary, defectsNotFixed: 3, maintenanceOverdue: 0 },
      }),
    ).toEqual([
      expect.any(String),
      'Defects found in this period: 1. 3 defects are not marked fixed (older ones included).',
      'Maintenance recorded as done: 1. 0 items are overdue today.',
      'Due dates entered or corrected by hand in this period: 1.',
    ]);
  });
});

describe('the printed page', () => {
  const html = auditPackHtml(PACK);

  it('names the vehicle, the company, the period and the day it was made', () => {
    expect(html).toContain('<h1>Vehicle audit pack</h1>');
    expect(html).toContain('<strong>Scania R450</strong>, NX21ABC · Acme Haulage');
    expect(html).toContain('1 Oct 2026 to 8 Nov 2026');
    expect(html).toContain('<title>Vehicle audit pack, NX21ABC</title>');
  });

  it('has every section, with the records in them', () => {
    for (const heading of [
      'In short',
      'Walk-round checks',
      'Defects and repairs',
      'Maintenance dates today',
      'Maintenance done in this period',
      'Due dates entered or corrected',
      'Everything in order',
    ]) {
      expect(html).toContain(`<h2>${heading}</h2>`);
    }
    expect(html).toContain('Daily walk-round (version 3)');
    expect(html).toContain(
      'Replace brake light, due 4 Nov 2026: done on 4 Nov 2026 by Pat Office. New bulb',
    );
    expect(html).toContain('Overdue');
  });

  it('says plainly what the report is not, and what it does not keep', () => {
    expect(html).toContain(
      'not a statement that the vehicle or the operator meets any legal requirement',
    );
    expect(html).toContain(
      'A change made before this history was kept may show only the latest one, or none',
    );
  });

  it('prints every step of a defect with who took it, and the due dates that were corrected', () => {
    expect(html).toContain('Seen by the office: 3 Nov 2026, 09:00, Pat Office');
    expect(html).toContain('Fixed: 4 Nov 2026, 10:00, Pat Office');
    // Date before, new date and who, in that order.
    expect(html).toMatch(/1 Sep 2026<\/td>\s*<td>1 Oct 2026<\/td>\s*<td>Pat Office<\/td>/);
  });

  it('says when no due date was entered or corrected, and shows a first entry as having no date before', () => {
    const none = auditPackHtml({ ...PACK, maintenance: { ...PACK.maintenance, changes: [] } });
    expect(none).toContain('No due date was entered or corrected by hand in this period.');
    const first = auditPackHtml({
      ...PACK,
      maintenance: {
        ...PACK.maintenance,
        changes: [
          { item: 'MOT', to: '2026-10-01', at: '2026-10-05T09:00:00.000Z', by: 'Pat Office' },
        ],
      },
    });
    expect(first).toContain('No date before');
  });

  it('says so when a section has nothing in it, rather than leaving a blank table', () => {
    const empty = auditPackHtml({
      ...PACK,
      checks: [],
      defects: [],
      maintenance: { items: [], done: [], changes: [] },
      timeline: [],
    });
    expect(empty).toContain('No checks were recorded in this period.');
    expect(empty).toContain('No defects in this period, and none still open.');
    expect(empty).toContain('No maintenance dates are kept for this vehicle.');
    expect(empty).toContain('Nothing was recorded as done in this period.');
    expect(empty).toContain('Nothing was recorded in this period.');
  });

  it('escapes everything a person typed, so a note cannot put markup in the page', () => {
    const nasty = '<img src=x onerror=alert(1)>';
    const out = auditPackHtml({
      ...PACK,
      vehicle: { ...PACK.vehicle, name: nasty, company: nasty },
      defects: [{ ...PACK.defects[0]!, detail: nasty, item: nasty, foundBy: nasty }],
      timeline: [
        { at: '2026-11-03T06:30:00.000Z', kind: 'check', title: nasty, detail: nasty, who: nasty },
      ],
    });
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('dayText', () => {
  it('writes a day the UK way, whatever the zone of the machine', () => {
    expect(dayText('2026-11-03')).toBe('3 Nov 2026');
    expect(dayText('2026-01-01')).toBe('1 Jan 2026');
  });

  it('writes September as Sep, not Sept, whatever the browser would', () => {
    expect(dayText('2026-09-03')).toBe('3 Sep 2026');
  });
});

describe('dateTimeText', () => {
  it('writes a moment in UK time, in summer and in winter, with midnight as 00', () => {
    expect(dateTimeText('2026-11-03T06:30:00.000Z')).toBe('3 Nov 2026, 06:30');
    // 23:30 UTC on 3 September is half past midnight on the 4th in British Summer Time.
    expect(dateTimeText('2026-09-03T23:30:00.000Z')).toBe('4 Sep 2026, 00:30');
    expect(dateTimeText('2026-01-05T00:05:00.000Z')).toBe('5 Jan 2026, 00:05');
  });
});

describe('statusSteps', () => {
  const defect = PACK.defects[0]!;

  it('gives every step, oldest first', () => {
    expect(statusSteps(defect).map((s) => [s.status, s.by])).toEqual([
      ['acknowledged', 'Pat Office'],
      ['fixed', 'Pat Office'],
    ]);
  });

  it('falls back to the one change on record when there are no steps, and to nothing when there is none', () => {
    expect(statusSteps({ ...defect, history: [] })).toEqual([
      { status: 'fixed', at: '2026-11-04T10:00:00.000Z', by: 'Pat Office' },
    ]);
    const untouched = { ...defect, history: [], status: 'open' as const };
    delete (untouched as { lastChangeAt?: string }).lastChangeAt;
    expect(statusSteps(untouched)).toEqual([]);
  });
});
