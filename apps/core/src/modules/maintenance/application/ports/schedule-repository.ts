import type {
  CompanyId,
  DateChange,
  HistoryEntry,
  ItemTypeId,
  Schedule,
  StaffId,
  VehicleId,
} from '../../domain/maintenance.js';

export interface ScheduleRepository {
  listForCompany(companyId: CompanyId): Promise<Schedule[]>;
  listForVehicle(vehicleId: VehicleId): Promise<Schedule[]>;
  find(vehicleId: VehicleId, itemTypeId: ItemTypeId): Promise<Schedule | null>;
  /** Sets when the item is next due (and when it was last done) on the vehicle, replacing what was there. */
  upsert(companyId: CompanyId, schedule: Schedule, by: StaffId, at: Date): Promise<void>;
  addHistory(companyId: CompanyId, entry: HistoryEntry): Promise<void>;
  /** Keeps a record that a due date was entered or corrected, for the audit pack. */
  addDateChange(companyId: CompanyId, change: DateChange): Promise<void>;
  /** Newest first. */
  listHistory(vehicleId: VehicleId): Promise<HistoryEntry[]>;
}
