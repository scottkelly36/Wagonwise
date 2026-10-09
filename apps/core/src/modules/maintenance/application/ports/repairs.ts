import type { CompanyId, DayString, StaffId } from '../../domain/maintenance.js';
import type { DefectId, Repair, RepairId, Severity } from '../../domain/repair.js';

export interface RepairRepository {
  findById(id: RepairId): Promise<Repair | null>;
  /** The repair still open for this defect, if there is one. */
  findOpenForDefect(defectId: DefectId): Promise<Repair | null>;
  /** The company's repairs, newest due date last; `status` of `all` includes finished and cancelled ones. */
  list(companyId: CompanyId, status: 'open' | 'done' | 'all'): Promise<Repair[]>;
  insert(repair: Repair): Promise<void>;
  complete(
    id: RepairId,
    doneOn: DayString,
    note: string | undefined,
    by: StaffId,
    at: Date,
  ): Promise<void>;
  cancel(id: RepairId, by: StaffId, at: Date): Promise<void>;
}

/** A defect as maintenance needs it to book a repair. Supplied by composition over `checks` (AGENTS.md rule 7). */
export interface DefectInfo {
  readonly id: DefectId;
  readonly companyId: CompanyId;
  readonly vehicleId: string;
  readonly vehicleName: string;
  readonly label: string;
  readonly detail: string;
  readonly severity: Severity;
  readonly status: 'open' | 'acknowledged' | 'fixed';
}

export interface DefectDirectory {
  find(defectId: DefectId): Promise<DefectInfo | null>;
  /** Marks the defect seen or fixed. Permission is for the caller to have checked. */
  setStatus(defectId: DefectId, status: 'acknowledged' | 'fixed', staffId: StaffId): Promise<void>;
}
