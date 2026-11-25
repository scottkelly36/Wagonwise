import type { VehicleUse } from '../modules/billing/api.js';

interface Days {
  readonly vehicleId: string;
  readonly firstDay: string;
  readonly activeInRange: boolean;
}

/**
 * One vehicle list from the jobs a company gave its vehicles and the walk-round checks done on them, for billing. A vehicle was used
 * in the month if either says so, and its first day is the earlier of the two: a vehicle first checked in August and first given a job
 * in October is an August vehicle.
 */
export function mergeVehicleUse(
  fromJobs: readonly Days[],
  fromChecks: readonly Days[],
): VehicleUse[] {
  const byVehicle = new Map<string, { firstDay: string; usedInMonth: boolean }>();
  for (const v of [...fromJobs, ...fromChecks]) {
    const seen = byVehicle.get(v.vehicleId);
    byVehicle.set(v.vehicleId, {
      firstDay: seen === undefined || v.firstDay < seen.firstDay ? v.firstDay : seen.firstDay,
      usedInMonth: (seen?.usedInMonth ?? false) || v.activeInRange,
    });
  }
  return [...byVehicle].map(([vehicleId, v]) => ({ vehicleId, ...v }));
}
