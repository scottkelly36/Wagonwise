import type { TachographFileRow } from '@wagonwise/contracts/tachograph';
import { describe, expect, it } from 'vitest';
import {
  cardFlagCounts,
  cardFlagText,
  cardFlags,
  daysToExpiry,
  downloadCounts,
  namesCouldMatch,
  dueText,
  needsAction,
  sizeText,
  STATE_LABELS,
  trackerRows,
} from './tachograph';

const TODAY = '2026-11-26';
const file = (over: Partial<TachographFileRow>): TachographFileRow => ({
  id: 'f',
  kind: 'driver_card',
  driverId: 'sam',
  fileName: 'C.ddd',
  sizeBytes: 1000,
  downloadedOn: '2026-11-20',
  receivedAt: '2026-11-21T10:00:00.000Z',
  source: 'office',
  ...over,
});

describe('trackerRows', () => {
  const drivers = [
    { id: 'sam', name: 'Sam' },
    { id: 'kim', name: 'Kim' },
    { id: 'lee', name: 'Lee' },
  ];
  const vehicles = [{ id: 'v1', name: 'AB12 CDE' }];

  it('lists every driver and vehicle, with none left out for having no file', () => {
    const rows = trackerRows(drivers, vehicles, [file({})], TODAY);
    expect(rows.map((r) => `${r.kind}:${r.name}:${r.status.state}`).sort()).toEqual([
      'driver_card:Kim:no_file',
      'driver_card:Lee:no_file',
      'driver_card:Sam:ok',
      'vehicle_unit:AB12 CDE:no_file',
    ]);
  });

  it('puts overdue first, then due soon, then no file, then the rest', () => {
    const latest = [
      file({ driverId: 'sam', downloadedOn: '2026-11-20' }), // ok: due 18 Dec
      file({ id: 'k', driverId: 'kim', downloadedOn: '2026-10-20' }), // overdue
      file({ id: 'l', driverId: 'lee', downloadedOn: '2026-11-05' }), // due 3 Dec: soon
      file({
        id: 'u',
        kind: 'vehicle_unit',
        driverId: undefined,
        vehicleId: 'v1',
        downloadedOn: '2026-11-20',
      }),
    ];
    const rows = trackerRows(drivers, vehicles, latest, TODAY);
    expect(rows.map((r) => r.status.state)).toEqual(['overdue', 'due_soon', 'ok', 'ok']);
    expect(rows[0]?.name).toBe('Kim');
    expect(needsAction(rows)).toBe(1);
  });

  it('does not take a vehicle unit file for a driver card of the same id', () => {
    const rows = trackerRows(
      [{ id: 'x', name: 'X' }],
      [],
      [file({ kind: 'vehicle_unit', driverId: undefined, vehicleId: 'x' })],
      TODAY,
    );
    expect(rows[0]?.status.state).toBe('no_file');
  });
});

describe('downloadCounts', () => {
  it('counts the cards and units that are overdue, due soon and without a file', () => {
    const rows = trackerRows(
      [
        { id: 'sam', name: 'Sam' },
        { id: 'kim', name: 'Kim' },
        { id: 'lee', name: 'Lee' },
        { id: 'pat', name: 'Pat' },
      ],
      [],
      [
        file({ driverId: 'sam', downloadedOn: '2026-10-01' }),
        file({ id: 'g', driverId: 'kim', downloadedOn: '2026-10-30' }),
        file({ id: 'h', driverId: 'lee', downloadedOn: '2026-11-20' }),
      ],
      TODAY,
    );
    expect(downloadCounts(rows)).toEqual({ overdue: 1, dueSoon: 1, noFile: 1 });
  });
});

describe('wording', () => {
  it('never says compliant or up to date', () => {
    for (const label of Object.values(STATE_LABELS)) {
      expect(label.toLowerCase()).not.toContain('complian');
      expect(label.toLowerCase()).not.toContain('up to date');
    }
  });

  it('says when the next download is due', () => {
    expect(dueText({ state: 'ok', dueOn: '2026-12-12', daysLeft: 16 })).toBe(
      'Due by 12 Dec (in 16 days)',
    );
    expect(dueText({ state: 'due_soon', dueOn: '2026-11-27', daysLeft: 1 })).toBe(
      'Due by 27 Nov (in 1 day)',
    );
    expect(dueText({ state: 'due_soon', dueOn: '2026-11-26', daysLeft: 0 })).toBe(
      'Due today, 26 Nov',
    );
    expect(dueText({ state: 'overdue', dueOn: '2026-11-23', daysLeft: -3 })).toBe(
      'Was due 23 Nov (3 days ago)',
    );
    expect(dueText({ state: 'no_file' })).toBe('');
  });

  it('reads sizes as a person would', () => {
    expect(sizeText(500)).toBe('500 B');
    expect(sizeText(280_000)).toBe('280 KB');
    expect(sizeText(2_400_000)).toBe('2.4 MB');
  });
});

describe('what a card file says about its card', () => {
  const card = (expiresOn: string, holderName = 'Sam Smith') => ({
    cardNumber: 'TEST000000000100',
    holderName,
    expiresOn,
    generations: '1' as const,
  });

  it('counts the days to the day the card runs out', () => {
    expect(daysToExpiry('2026-12-26', TODAY)).toBe(30);
    expect(daysToExpiry('2026-11-26', TODAY)).toBe(0);
    expect(daysToExpiry('2026-11-25', TODAY)).toBe(-1);
  });

  it('flags a card that has run out, or runs out within 60 days, and says nothing otherwise', () => {
    expect(cardFlags('Sam Smith', card('2026-11-25'), TODAY)).toEqual(['expired']);
    expect(cardFlags('Sam Smith', card('2027-01-25'), TODAY)).toEqual(['expires_soon']);
    expect(cardFlags('Sam Smith', card('2027-01-26'), TODAY)).toEqual([]);
    expect(cardFlags('Sam Smith', undefined, TODAY)).toEqual([]);
  });

  it('flags a name that shares nothing with the driver, and lets nicknames and middle names through', () => {
    expect(namesCouldMatch('Sam Smith', 'Samuel Smith')).toBe(true);
    expect(namesCouldMatch('S. Smith', 'Samuel James Smith')).toBe(true);
    expect(namesCouldMatch('José Núñez', 'JOSE NUNEZ')).toBe(true);
    expect(namesCouldMatch('Sam Smith', 'Kim Jones')).toBe(false);
    // Nothing to compare: say nothing.
    expect(namesCouldMatch('', 'Kim Jones')).toBe(true);
    expect(cardFlags('Sam Smith', card('2030-01-01', 'Kim Jones'), TODAY)).toEqual([
      'name_differs',
    ]);
  });

  it('puts the flags on the driver rows, not the vehicles, and counts them', () => {
    const rows = trackerRows(
      [
        { id: 'sam', name: 'Sam Smith' },
        { id: 'kim', name: 'Kim Jones' },
      ],
      [{ id: 'v1', name: 'AB12 CDE' }],
      [
        file({ id: 'a', driverId: 'sam', card: card('2027-01-01') }),
        file({ id: 'b', driverId: 'kim', card: card('2030-01-01') }),
      ],
      TODAY,
    );
    expect(rows.find((r) => r.name === 'Sam Smith')?.cardFlags).toEqual(['expires_soon']);
    expect(rows.find((r) => r.name === 'Kim Jones')?.cardFlags).toEqual(['name_differs']);
    expect(rows.find((r) => r.kind === 'vehicle_unit')?.cardFlags).toEqual([]);
    expect(cardFlagCounts(rows)).toEqual({ expiry: 1, nameDiffers: 1 });
  });

  it('words each flag plainly', () => {
    expect(cardFlagText('expires_soon', card('2026-12-06'), TODAY)).toBe(
      'Card runs out in 10 days',
    );
    expect(cardFlagText('expires_soon', card('2026-11-27'), TODAY)).toBe('Card runs out in 1 day');
    expect(cardFlagText('expires_soon', card(TODAY), TODAY)).toBe('Card runs out today');
    expect(cardFlagText('expired', card('2026-01-01'), TODAY)).toBe('Card has run out');
    expect(cardFlagText('name_differs', card('2030-01-01', 'Kim Jones'), TODAY)).toContain(
      'Kim Jones',
    );
  });
});
