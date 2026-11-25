import { describe, expect, it } from 'vitest';
import { mergeVehicleUse } from './vehicle-use.js';

const day = (vehicleId: string, firstDay: string, activeInRange: boolean) => ({
  vehicleId,
  firstDay,
  activeInRange,
});

describe('mergeVehicleUse', () => {
  it('counts a vehicle as used if either its jobs or its checks say so, and takes the earlier first day', () => {
    const merged = mergeVehicleUse(
      [day('a', '2026-10-02', true), day('b', '2026-09-01', false)],
      [day('a', '2026-08-15', false), day('c', '2026-10-20', true), day('b', '2026-09-05', true)],
    );
    expect(merged).toEqual([
      { vehicleId: 'a', firstDay: '2026-08-15', usedInMonth: true },
      { vehicleId: 'b', firstDay: '2026-09-01', usedInMonth: true },
      { vehicleId: 'c', firstDay: '2026-10-20', usedInMonth: true },
    ]);
  });

  it('keeps a vehicle that was not used in the month, so its first day is not lost', () => {
    expect(mergeVehicleUse([day('a', '2026-03-01', false)], [])).toEqual([
      { vehicleId: 'a', firstDay: '2026-03-01', usedInMonth: false },
    ]);
  });

  it('gives nothing for no activity at all', () => {
    expect(mergeVehicleUse([], [])).toEqual([]);
  });
});
