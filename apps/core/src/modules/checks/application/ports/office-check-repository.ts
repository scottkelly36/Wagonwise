import type { CompanyId, StaffId, VehicleId } from '../../domain/check-template.js';
import type { CheckId } from '../../domain/check.js';
import type {
  CheckDetail,
  CheckSummary,
  DefectId,
  DefectRecord,
  DefectStatus,
} from '../../domain/office.js';

export interface StoredCheckPhoto {
  readonly contentType: string;
  readonly dataBase64: string;
  readonly capturedAt: Date;
}

/** What the office reads of the checks drivers have done, and how it works through the defects. */
export interface OfficeCheckRepository {
  /** Newest first. Both days are UK days, included. */
  listSummaries(companyId: CompanyId, fromDay: string, toDay: string): Promise<CheckSummary[]>;
  findDetail(id: CheckId): Promise<CheckDetail | null>;
  findPhoto(checkId: CheckId, itemId: string): Promise<StoredCheckPhoto | null>;
  /** Most serious first, then newest. */
  listDefects(companyId: CompanyId, statuses: readonly DefectStatus[]): Promise<DefectRecord[]>;
  findDefect(id: DefectId): Promise<DefectRecord | null>;
  setDefectStatus(id: DefectId, status: DefectStatus, by: StaffId, at: Date): Promise<void>;
  /** Whether the vehicle has a "do not drive" defect that is open or seen, but not yet fixed. */
  vehicleHasUnfixedDoNotDrive(vehicleId: VehicleId): Promise<boolean>;
}
