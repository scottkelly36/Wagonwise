import type { Id } from '../../../shared/brand.js';
import {
  daysBetween,
  type CompanyId,
  type DayString,
  type StaffId,
  type VehicleId,
} from './maintenance.js';

export type RepairId = Id<'RepairId'>;
/** The id of a defect in the checks module. maintenance holds it as a plain id and never reads the defect directly. */
export type DefectId = string;

export type RepairStatus = 'open' | 'done' | 'cancelled';
export type Severity = 'advisory' | 'do_not_drive';

/**
 * A repair booked for a defect a driver found. Its words are kept as they were when it was booked. While it is open it
 * is overdue once its due date has passed; finishing it can mark the defect fixed.
 */
export interface Repair {
  readonly id: RepairId;
  readonly companyId: CompanyId;
  readonly defectId: DefectId;
  readonly vehicleId: VehicleId;
  readonly vehicleName: string;
  /** What is to be repaired, in words: "Tyres: Flagged as a defect". */
  readonly title: string;
  readonly severity: Severity;
  readonly dueDate: DayString;
  readonly status: RepairStatus;
  readonly note: string | undefined;
  readonly doneOn: DayString | undefined;
  readonly createdAt: Date;
  readonly createdBy: StaffId | undefined;
  readonly completedAt: Date | undefined;
  readonly completedBy: StaffId | undefined;
}

/** The title shown for a repair: the question that was flagged and what was found. */
export function repairTitle(label: string, detail: string): string {
  return `${label}: ${detail}`.slice(0, 200);
}

/** Days until it is due; negative once it is late. */
export const daysLeft = (repair: Pick<Repair, 'dueDate'>, today: DayString): number =>
  daysBetween(today, repair.dueDate);

/** An open repair whose date has passed. A finished or cancelled one is never overdue. */
export const isOverdue = (repair: Pick<Repair, 'status' | 'dueDate'>, today: DayString): boolean =>
  repair.status === 'open' && daysLeft(repair, today) < 0;

/** Most urgent first: do-not-drive before fix-soon within the same urgency, then the earliest due date. */
export function sortRepairs(repairs: readonly Repair[]): Repair[] {
  const rank = { do_not_drive: 0, advisory: 1 } as const;
  return [...repairs].sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      rank[a.severity] - rank[b.severity] ||
      a.vehicleName.localeCompare(b.vehicleName),
  );
}
