import { describe, expect, it } from 'vitest';
import {
  flowChoiceLabel,
  flowChoiceRows,
  seconds,
  versionLabel,
  ago,
  barHeights,
  cohortShare,
  fromFirstJoin,
  percentOf,
  retentionCells,
  shortDay,
  withShare,
} from './usage';

const now = new Date('2026-10-09T12:00:00.000Z');

describe('ago', () => {
  it('says how long ago in the biggest sensible unit', () => {
    expect(ago(null, now)).toBe('Never');
    expect(ago('2026-10-09T11:59:00.000Z', now)).toBe('Just now');
    expect(ago('2026-10-09T11:30:00.000Z', now)).toBe('30 minutes ago');
    expect(ago('2026-10-09T10:30:00.000Z', now)).toBe('1 hour ago');
    expect(ago('2026-10-09T07:00:00.000Z', now)).toBe('5 hours ago');
    expect(ago('2026-10-08T05:00:00.000Z', now)).toBe('1 day ago');
    expect(ago('2026-10-02T12:00:00.000Z', now)).toBe('7 days ago');
  });
});

describe('barHeights', () => {
  it('scales to the tallest, and keeps an empty series flat', () => {
    expect(barHeights([0, 2, 4])).toEqual([0, 50, 100]);
    expect(barHeights([0, 0])).toEqual([0, 0]);
    expect(barHeights([])).toEqual([]);
  });
});

describe('shortDay', () => {
  it('writes the day and month', () => {
    expect(shortDay('2026-10-09')).toBe('9 Oct');
  });
});

describe('percentOf and withShare', () => {
  it('gives a rounded share of the whole, and 0% when there is nothing to divide by', () => {
    expect(percentOf(110, 119)).toBe('92%');
    expect(percentOf(1, 3)).toBe('33%');
    expect(percentOf(0, 0)).toBe('0%');
    expect(percentOf(5, 0)).toBe('0%');
    expect(withShare(41, 119)).toBe('41 (34%)');
  });
});

describe('cohortShare', () => {
  it("is the share of the day's new drivers, or a dash on a day nobody joined", () => {
    expect(cohortShare(3, 5)).toBe('60%');
    expect(cohortShare(0, 4)).toBe('0%');
    expect(cohortShare(0, 0)).toBe('–');
  });
});

describe('fromFirstJoin', () => {
  const day = (joined: number) => ({ joined });

  it('drops the empty days before the first new driver, and keeps empty days after it', () => {
    expect(fromFirstJoin([day(0), day(0), day(5), day(0), day(2)])).toEqual([
      day(5),
      day(0),
      day(2),
    ]);
  });

  it('is empty when nobody joined at all', () => {
    expect(fromFirstJoin([day(0), day(0)])).toEqual([]);
    expect(fromFirstJoin([])).toEqual([]);
  });
});

describe('retentionCells', () => {
  it('gives the share who started a trip in each week since joining, blank for weeks still to come', () => {
    expect(retentionCells({ joined: 40, startedTripInWeek: [30, 12, 9] }, 5)).toEqual([
      '75%',
      '30%',
      '23%',
      '',
      '',
    ]);
  });

  it('fills eight weeks by default', () => {
    expect(retentionCells({ joined: 10, startedTripInWeek: [1, 2, 3, 4, 5, 6, 7, 8] })).toEqual([
      '10%',
      '20%',
      '30%',
      '40%',
      '50%',
      '60%',
      '70%',
      '80%',
    ]);
  });

  it('shows a dash for a week nobody joined', () => {
    expect(retentionCells({ joined: 0, startedTripInWeek: [0, 0] }, 3)).toEqual(['–', '–', '']);
  });
});

describe('flow helpers', () => {
  it('names choices in plain English, and shows an unknown one as it is', () => {
    expect(flowChoiceLabel('hill_sensitive')).toBe('Hill-sensitive');
    expect(flowChoiceLabel('rigid_18t')).toBe('rigid 18t');
  });

  it('groups choices by event, most common first, with shares', () => {
    expect(
      flowChoiceRows([
        { event: 'trip_ended', choice: 'end_button', count: 1 },
        { event: 'destination_chosen', choice: 'map', count: 1 },
        { event: 'destination_chosen', choice: 'search', count: 3 },
      ]),
    ).toEqual([
      {
        event: 'destination_chosen',
        label: 'Destination picked by',
        value: 'Search 3 (75%), Map 1 (25%)',
      },
      { event: 'trip_ended', label: 'How trips ended', value: 'End button 1 (100%)' },
    ]);
  });

  it('writes seconds as seconds or minutes', () => {
    expect(seconds(null)).toBe('–');
    expect(seconds(45)).toBe('45 s');
    expect(seconds(120)).toBe('2 min');
    expect(seconds(125)).toBe('2 min 5 s');
  });
});

it('labels a version with the day its over-the-air update was published', () => {
  expect(versionLabel('1.2.1', '2026-11-18')).toBe('1.2.1 · 18 Nov');
  expect(versionLabel('1.2.1', null)).toBe('1.2.1 · no date');
  expect(versionLabel('1.3.0', undefined)).toBe('1.3.0 · no date');
});
