import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import {
  addInterval,
  appliesToVehicle,
  buildOverview,
  daysBetween,
  STARTER_ITEMS,
  statusOf,
  ukDay,
  validateDay,
  validateItemType,
  type ItemType,
  type ItemTypeInput,
  type Schedule,
  type VehicleSummary,
} from './maintenance.js';

const van = makeId<'FleetVehicleId'>('van');
const lorry = makeId<'FleetVehicleId'>('lorry');
const company = makeId<'CompanyId'>('c1');

describe('addInterval', () => {
  it('adds days and weeks', () => {
    expect(addInterval('2026-10-09', 10, 'days')).toBe('2026-10-19');
    expect(addInterval('2026-10-09', 6, 'weeks')).toBe('2026-11-20');
    expect(addInterval('2026-12-30', 3, 'days')).toBe('2027-01-02');
  });

  it('adds months, keeping the day of the month', () => {
    expect(addInterval('2026-10-09', 12, 'months')).toBe('2027-10-09');
    expect(addInterval('2026-10-09', 6, 'months')).toBe('2027-04-09');
    expect(addInterval('2026-11-15', 3, 'months')).toBe('2027-02-15');
  });

  it('uses the last day of a shorter month when the day does not exist there', () => {
    expect(addInterval('2026-01-31', 1, 'months')).toBe('2026-02-28');
    expect(addInterval('2027-12-31', 2, 'months')).toBe('2028-02-29');
    expect(addInterval('2028-02-29', 12, 'months')).toBe('2029-02-28');
  });
});

describe('days', () => {
  it('counts whole days, negative when earlier', () => {
    expect(daysBetween('2026-10-09', '2026-10-10')).toBe(1);
    expect(daysBetween('2026-10-09', '2026-10-09')).toBe(0);
    expect(daysBetween('2026-10-09', '2026-10-01')).toBe(-8);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // across the clocks going forward
  });

  it('knows a real day from a false one', () => {
    expect(validateDay('2026-10-09').ok).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '9 Oct', '2026-1-1', '']) {
      expect(validateDay(bad).ok).toBe(false);
    }
  });

  it('is the UK day, which in summer is ahead of UTC late in the evening', () => {
    expect(ukDay(new Date('2026-06-30T23:30:00.000Z'))).toBe('2026-07-01');
    expect(ukDay(new Date('2026-12-30T23:30:00.000Z'))).toBe('2026-12-30');
  });
});

describe('statusOf', () => {
  it('is overdue once the date has passed, and fine on the day itself', () => {
    expect(statusOf('2026-10-08', '2026-10-09', 28)).toBe('overdue');
    expect(statusOf('2026-10-09', '2026-10-09', 0)).toBe('due_soon');
  });

  it('is due soon within the warning period, inclusive, and ok beyond it', () => {
    expect(statusOf('2026-11-06', '2026-10-09', 28)).toBe('due_soon');
    expect(statusOf('2026-11-07', '2026-10-09', 28)).toBe('ok');
  });

  it('has no date until one is entered', () => {
    expect(statusOf(undefined, '2026-10-09', 28)).toBe('no_date');
  });
});

describe('validateItemType', () => {
  const base: ItemTypeInput = {
    name: 'MOT',
    intervalValue: 12,
    intervalUnit: 'months',
    warnDays: 28,
    appliesTo: 'all',
    vehicleIds: [],
  };
  const reason = (input: ItemTypeInput) => {
    const r = validateItemType(input);
    return r.ok ? 'ok' : r.error.reason;
  };

  it('accepts a sound item, trims the name, and drops vehicles from an "all" item', () => {
    const r = validateItemType({ ...base, name: '  MOT ', vehicleIds: [van] });
    expect(r.ok && [r.value.name, r.value.vehicleIds]).toEqual(['MOT', []]);
  });

  it('refuses a blank name, an interval that is not a whole number, and a bad warning period', () => {
    expect(reason({ ...base, name: ' ' })).toBe('name');
    expect(reason({ ...base, intervalValue: 0 })).toBe('interval');
    expect(reason({ ...base, intervalValue: 1.5 })).toBe('interval');
    expect(reason({ ...base, intervalUnit: 'years' as never })).toBe('interval');
    expect(reason({ ...base, warnDays: -1 })).toBe('warn_days');
    expect(reason({ ...base, warnDays: 366 })).toBe('warn_days');
  });

  it('needs vehicles when it is for selected ones', () => {
    expect(reason({ ...base, appliesTo: 'selected' })).toBe('no_vehicles_selected');
    expect(reason({ ...base, appliesTo: 'selected', vehicleIds: [van] })).toBe('ok');
  });
});

describe('buildOverview', () => {
  const item = (id: string, name: string, over: Partial<ItemType> = {}): ItemType => ({
    id: makeId<'MaintenanceItemId'>(id),
    companyId: company,
    name,
    intervalValue: 12,
    intervalUnit: 'months',
    warnDays: 28,
    appliesTo: 'all',
    vehicleIds: [],
    archivedAt: undefined,
    createdAt: new Date('2026-10-01T09:00:00.000Z'),
    updatedAt: new Date('2026-10-01T09:00:00.000Z'),
    ...over,
  });
  const vehicles: VehicleSummary[] = [
    { id: van, name: 'Van', registration: 'AB12CDE' },
    { id: lorry, name: 'Lorry', registration: undefined },
  ];
  const schedule = (vehicleId: typeof van, itemId: string, dueDate: string): Schedule => ({
    vehicleId,
    itemTypeId: makeId<'MaintenanceItemId'>(itemId),
    dueDate,
    lastDone: undefined,
  });
  const today = '2026-10-09';

  it('lists every vehicle with every item that applies, most urgent first', () => {
    const rows = buildOverview({
      itemTypes: [item('mot', 'MOT'), item('svc', 'Service')],
      vehicles,
      schedules: [
        schedule(van, 'mot', '2026-10-01'), // overdue by 8
        schedule(lorry, 'mot', '2026-10-20'), // due soon
        schedule(van, 'svc', '2027-03-01'), // ok
        // the lorry's service has no date
      ],
      today,
    });
    expect(rows.map((r) => [r.vehicleName, r.itemName, r.status])).toEqual([
      ['Van', 'MOT', 'overdue'],
      ['Lorry', 'MOT', 'due_soon'],
      ['Lorry', 'Service', 'no_date'],
      ['Van', 'Service', 'ok'],
    ]);
    expect(rows[0]).toMatchObject({ daysUntil: -8, registration: 'AB12CDE' });
  });

  it('puts the most overdue first and the soonest due first', () => {
    const rows = buildOverview({
      itemTypes: [item('mot', 'MOT')],
      vehicles,
      schedules: [schedule(van, 'mot', '2026-10-08'), schedule(lorry, 'mot', '2026-09-01')],
      today,
    });
    expect(rows.map((r) => r.vehicleName)).toEqual(['Lorry', 'Van']);
  });

  it('leaves out archived items, and vehicles an item does not apply to', () => {
    const rows = buildOverview({
      itemTypes: [
        item('mot', 'MOT', { archivedAt: new Date('2026-10-05T09:00:00.000Z') }),
        item('lift', 'Tail-lift', { appliesTo: 'selected', vehicleIds: [lorry] }),
      ],
      vehicles,
      schedules: [],
      today,
    });
    expect(rows.map((r) => [r.vehicleName, r.itemName])).toEqual([['Lorry', 'Tail-lift']]);
    expect(appliesToVehicle({ appliesTo: 'selected', vehicleIds: [lorry] }, van)).toBe(false);
  });
});

describe('the example list', () => {
  it('is valid, and covers MOT', () => {
    for (const starter of STARTER_ITEMS) {
      expect(validateItemType({ ...starter, vehicleIds: [] }).ok).toBe(true);
    }
    expect(STARTER_ITEMS.map((s) => s.name)).toContain('MOT');
  });
});
