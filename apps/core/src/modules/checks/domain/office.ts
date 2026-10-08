import type { StaffId } from './check-template.js';
import type { Check, CheckId, DriverId, CheckResult } from './check.js';
import type { CheckTemplateId, CompanyId, DefectSeverity, VehicleId } from './check-template.js';

export type DefectId = string;
export type DefectStatus = 'open' | 'acknowledged' | 'fixed';

export const DEFECT_STATUSES: readonly DefectStatus[] = ['open', 'acknowledged', 'fixed'];

/** A defect found in a check, as the office works through it: open when found, acknowledged once seen, fixed
 *  when it has been dealt with. It can be moved to any of the three, so a mistake can be put right. */
export interface DefectRecord {
  readonly id: DefectId;
  readonly checkId: CheckId;
  readonly companyId: CompanyId;
  readonly vehicleId: VehicleId;
  readonly vehicleName: string;
  readonly itemId: string;
  readonly label: string;
  readonly severity: DefectSeverity;
  readonly detail: string;
  readonly note: string | undefined;
  readonly status: DefectStatus;
  readonly createdAt: Date;
  readonly statusChangedAt: Date | undefined;
  readonly statusChangedBy: StaffId | undefined;
}

/** One line of the results list. */
export interface CheckSummary {
  readonly id: CheckId;
  readonly companyId: CompanyId;
  readonly templateId: CheckTemplateId;
  readonly templateName: string;
  readonly vehicleId: VehicleId;
  readonly vehicleName: string;
  readonly driverId: DriverId;
  readonly checkDay: string;
  readonly submittedAt: Date;
  readonly result: CheckResult;
  readonly defectCount: number;
}

/** A check in full, with its defects as the office sees them and which questions have a photo. */
export interface CheckDetail extends Omit<Check, 'defects'> {
  readonly defects: readonly DefectRecord[];
  readonly photoItemIds: readonly string[];
}

export function isDefectStatus(value: string): value is DefectStatus {
  return (DEFECT_STATUSES as readonly string[]).includes(value);
}

/** What the office is working through: everything not yet fixed. */
export const UNFINISHED: readonly DefectStatus[] = ['open', 'acknowledged'];
