import type { JobDto } from '@wagonwise/contracts/jobs';
import { describe, expect, it } from 'vitest';
import type { Tile } from './home';
import { byUrgency, managerSummary, todaysJobs } from './home-summary';

const now = new Date(2026, 9, 9, 12, 0, 0);
const at = (h: number, day = 9): string => new Date(2026, 9, day, h, 0, 0).toISOString();
const as = <T>(x: unknown): T => x as T;

const tile = (key: string, value: number, tone: Tile['tone']): Tile => ({
  key,
  label: key,
  value: String(value),
  sub: '',
  tone,
  area: 'ops',
  to: '/fleet',
});

const job = (over: Record<string, unknown>): JobDto =>
  as<JobDto>({
    id: 'j1',
    reference: 'JOB-1',
    status: 'assigned',
    stops: [
      { kind: 'pickup', name: 'Hexham Quarry' },
      { kind: 'delivery', name: 'Newcastle Depot' },
    ],
    currentStop: 0,
    ...over,
  });

describe('byUrgency', () => {
  it('puts red first, then amber, then quiet, keeping the order within each', () => {
    const sorted = byUrgency([
      tile('a', 0, 'quiet'),
      tile('b', 2, 'warn'),
      tile('c', 1, 'bad'),
      tile('d', 3, 'warn'),
    ]);
    expect(sorted.map((t) => t.key)).toEqual(['c', 'b', 'd', 'a']);
  });
});

describe('managerSummary', () => {
  it('says all clear when nothing needs a person', () => {
    const tiles = [tile('unassigned', 0, 'quiet'), tile('do-not-drive', 0, 'quiet')];
    expect(managerSummary({ tiles, late: 0, lowHours: 0 })).toBe(
      'All clear: nothing needs you right now.',
    );
  });

  it('names what needs a person, worst first, in singular and plural', () => {
    const tiles = [tile('unassigned', 2, 'warn'), tile('do-not-drive', 1, 'bad')];
    expect(managerSummary({ tiles, late: 1, lowHours: 0 })).toBe(
      '1 vehicle marked do not drive, 1 job running late and 2 jobs without a driver.',
    );
  });

  it('names one thing plainly', () => {
    expect(managerSummary({ tiles: [], late: 3, lowHours: 0 })).toBe('3 jobs running late.');
  });

  it('names three and counts the rest', () => {
    const tiles = [
      tile('do-not-drive', 1, 'bad'),
      tile('unassigned', 2, 'warn'),
      tile('not-opened', 1, 'warn'),
      tile('maintenance', 4, 'warn'),
    ];
    expect(managerSummary({ tiles, late: 2, lowHours: 1 })).toBe(
      '1 vehicle marked do not drive, 2 jobs running late and 1 driver short of driving hours, and 3 more to look at.',
    );
  });
});

describe('todaysJobs', () => {
  it('lists jobs due or planned today, to do first by due time, then delivered', () => {
    const result = todaysJobs(
      [
        job({ id: 'done', reference: 'DONE', status: 'delivered', dueBy: at(9) }),
        job({ id: 'late', reference: 'LATE', status: 'en_route', dueBy: at(16) }),
        job({ id: 'soon', reference: 'SOON', status: 'assigned', dueBy: at(13) }),
        job({ id: 'tomorrow', reference: 'TOMORROW', dueBy: at(10, 10) }),
        job({ id: 'gone', reference: 'GONE', status: 'cancelled', dueBy: at(11) }),
        job({ id: 'plan', reference: 'PLAN', status: 'draft', plannedStart: at(14) }),
      ],
      now,
    );
    expect(result.rows.map((r) => r.reference)).toEqual(['SOON', 'PLAN', 'LATE', 'DONE']);
    expect(result).toMatchObject({ total: 4, delivered: 1, more: 0 });
  });

  it('reads each row: route, status with due time, and a job with no driver', () => {
    const { rows } = todaysJobs(
      [
        job({ id: 'a', status: 'en_route', dueBy: at(15) }),
        job({ id: 'b', status: 'draft', dueBy: at(16) }),
        job({ id: 'c', status: 'delivered', dueBy: at(9) }),
      ],
      now,
    );
    expect(rows[0]).toMatchObject({
      route: 'Hexham Quarry → Newcastle Depot',
      status: 'En route · due 15:00',
      tone: 'quiet',
    });
    expect(rows[1]).toMatchObject({ status: 'Needs a driver', tone: 'warn' });
    expect(rows[2]).toMatchObject({ status: 'Delivered', tone: 'good' });
  });

  it('shows a limited number and counts the rest', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      job({ id: `j${i}`, reference: `J${i}`, dueBy: at(13 + (i % 4)) }),
    );
    const result = todaysJobs(many, now, 6);
    expect(result.rows).toHaveLength(6);
    expect(result).toMatchObject({ total: 9, more: 3 });
  });
});
