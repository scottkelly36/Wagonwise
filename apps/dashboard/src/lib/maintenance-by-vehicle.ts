import type { MaintenanceStatusDto, OverviewRowDto } from '@wagonwise/contracts/maintenance';
import { dueText, STATUS_LABELS } from './maintenance';

/** Most urgent first: the order the overview is already in, and the order a vehicle's worst item is judged by. */
const URGENCY: readonly MaintenanceStatusDto[] = ['overdue', 'due_soon', 'no_date', 'ok'];

const urgency = (status: MaintenanceStatusDto): number => URGENCY.indexOf(status);

export interface VehicleSummary {
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly registration: string | undefined;
  /** Every item tracked on the vehicle, most urgent first. */
  readonly items: readonly OverviewRowDto[];
  /** The worst status among its items: what the vehicle as a whole needs. */
  readonly status: MaintenanceStatusDto;
  readonly counts: Readonly<Record<MaintenanceStatusDto, number>>;
  /** The item that makes the vehicle's status what it is (the most overdue, or the soonest due). */
  readonly worst: OverviewRowDto;
}

/** Orders items most urgent first; among equals, the one nearest (or furthest past) its date first. */
function byUrgency(a: OverviewRowDto, b: OverviewRowDto): number {
  return (
    urgency(a.status) - urgency(b.status) ||
    (a.daysUntil ?? Number.MAX_SAFE_INTEGER) - (b.daysUntil ?? Number.MAX_SAFE_INTEGER) ||
    a.itemName.localeCompare(b.itemName)
  );
}

/** The overview has a row per vehicle and item; the maintenance page wants a line per vehicle. */
export function groupByVehicle(rows: readonly OverviewRowDto[]): VehicleSummary[] {
  const byVehicle = new Map<string, OverviewRowDto[]>();
  for (const row of rows) {
    const list = byVehicle.get(row.vehicleId);
    if (list === undefined) byVehicle.set(row.vehicleId, [row]);
    else list.push(row);
  }
  return [...byVehicle.values()]
    .map((list): VehicleSummary => {
      const items = [...list].sort(byUrgency);
      const worst = items[0] as OverviewRowDto;
      const counts: Record<MaintenanceStatusDto, number> = {
        overdue: 0,
        due_soon: 0,
        no_date: 0,
        ok: 0,
      };
      for (const item of items) counts[item.status] += 1;
      return {
        vehicleId: worst.vehicleId,
        vehicleName: worst.vehicleName,
        registration: worst.registration,
        items,
        status: worst.status,
        counts,
        worst,
      };
    })
    .sort(
      (a, b) =>
        urgency(a.status) - urgency(b.status) ||
        byUrgency(a.worst, b.worst) ||
        a.vehicleName.localeCompare(b.vehicleName),
    );
}

/** Whether the vehicle has anything that is not fine: the "needs attention" test, as the page used it per item. */
export const needsAttention = (v: VehicleSummary): boolean => v.status !== 'ok';

/** "2 overdue, 1 due soon, 1 no date yet"; "All fine" when nothing is. Only the kinds that exist are listed. */
export function countsText(counts: VehicleSummary['counts']): string {
  const parts = (['overdue', 'due_soon', 'no_date'] as const)
    .filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${STATUS_LABELS[status].toLowerCase()}`);
  return parts.length === 0 ? 'All fine' : parts.join(', ');
}

/** The item that matters most, in words: "MOT: Overdue by 4 days". For a vehicle that is fine, the next to fall due. */
export function worstText(v: VehicleSummary): string {
  return `${v.worst.itemName}: ${dueText(v.worst)}`;
}

export interface FleetTotals {
  readonly vehicles: number;
  readonly overdue: number;
  readonly needAttention: number;
}

/** How many vehicles have something overdue, and how many need any attention at all. */
export function fleetTotals(vehicles: readonly VehicleSummary[]): FleetTotals {
  return {
    vehicles: vehicles.length,
    overdue: vehicles.filter((v) => v.status === 'overdue').length,
    needAttention: vehicles.filter(needsAttention).length,
  };
}
