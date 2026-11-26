import type { TachographFileRow } from '@wagonwise/contracts/tachograph';
import { describe, expect, it } from 'vitest';
import { dueText, needsAction, sizeText, STATE_LABELS, trackerRows } from './tachograph';

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
