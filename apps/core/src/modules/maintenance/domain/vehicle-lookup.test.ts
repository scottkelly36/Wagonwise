import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { ItemType } from './maintenance.js';
import { kindOfItem, suggestDates } from './vehicle-lookup.js';

const van = makeId<'FleetVehicleId'>('van');
const other = makeId<'FleetVehicleId'>('other');

const item = (id: string, name: string, extra: Partial<ItemType> = {}): ItemType => ({
  id: makeId<'MaintenanceItemId'>(id),
  companyId: makeId<'CompanyId'>('acme'),
  name,
  intervalValue: 12,
  intervalUnit: 'months',
  warnDays: 28,
  appliesTo: 'all',
  vehicleIds: [],
  archivedAt: undefined,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...extra,
});

describe('kindOfItem', () => {
  it("finds MOT and tax items by the firm's own wording", () => {
    expect(kindOfItem('MOT')).toBe('mot');
    expect(kindOfItem('HGV annual test')).toBe('mot');
    expect(kindOfItem('Road tax')).toBe('tax');
    expect(kindOfItem('Vehicle excise duty')).toBe('tax');
    expect(kindOfItem('VED')).toBe('tax');
  });

  it('leaves other items alone', () => {
    expect(kindOfItem('Safety inspection')).toBeUndefined();
    expect(kindOfItem('Tachograph calibration')).toBeUndefined();
    expect(kindOfItem('Service')).toBeUndefined();
    expect(kindOfItem('Motor insurance')).toBeUndefined();
  });
});

describe('suggestDates', () => {
  const dates = { motExpiry: '2027-03-01', taxDue: '2026-12-01' };

  it('offers the MOT date to the MOT item and the tax date to the tax item', () => {
    const out = suggestDates(
      [item('mot', 'MOT'), item('tax', 'Road tax')],
      van,
      dates,
      () => undefined,
    );
    expect(out.map((s) => [s.itemName, s.kind, s.dueDate])).toEqual([
      ['MOT', 'mot', '2027-03-01'],
      ['Road tax', 'tax', '2026-12-01'],
    ]);
  });

  it('skips items already due on that day, archived items and items for other vehicles', () => {
    const mot = item('mot', 'MOT');
    const items = [
      mot,
      item('tax', 'Road tax', { archivedAt: new Date('2026-02-01T00:00:00Z') }),
      item('ved', 'VED', { appliesTo: 'selected', vehicleIds: [other] }),
    ];
    expect(
      suggestDates(items, van, dates, (id) => (id === mot.id ? '2027-03-01' : undefined)),
    ).toEqual([]);
  });

  it('offers nothing for a date the record does not hold', () => {
    expect(
      suggestDates([item('mot', 'MOT')], van, { taxDue: '2026-12-01' }, () => undefined),
    ).toEqual([]);
  });
});
