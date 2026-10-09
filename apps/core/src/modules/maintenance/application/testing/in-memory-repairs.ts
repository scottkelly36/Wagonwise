import type { CompanyId, DayString, StaffId } from '../../domain/maintenance.js';
import type { DefectId, Repair, RepairId } from '../../domain/repair.js';
import type { DefectDirectory, DefectInfo, RepairRepository } from '../ports/repairs.js';

export class InMemoryRepairRepository implements RepairRepository {
  #byId = new Map<RepairId, Repair>();

  findById(id: RepairId): Promise<Repair | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  findOpenForDefect(defectId: DefectId): Promise<Repair | null> {
    return Promise.resolve(
      [...this.#byId.values()].find((r) => r.defectId === defectId && r.status === 'open') ?? null,
    );
  }

  list(companyId: CompanyId, status: 'open' | 'done' | 'all'): Promise<Repair[]> {
    return Promise.resolve(
      [...this.#byId.values()].filter(
        (r) => r.companyId === companyId && (status === 'all' || r.status === status),
      ),
    );
  }

  insert(repair: Repair): Promise<void> {
    this.#byId.set(repair.id, repair);
    return Promise.resolve();
  }

  complete(
    id: RepairId,
    doneOn: DayString,
    note: string | undefined,
    by: StaffId,
    at: Date,
  ): Promise<void> {
    const r = this.#byId.get(id);
    if (r) {
      this.#byId.set(id, {
        ...r,
        status: 'done',
        doneOn,
        note: note ?? r.note,
        completedBy: by,
        completedAt: at,
      });
    }
    return Promise.resolve();
  }

  cancel(id: RepairId, by: StaffId, at: Date): Promise<void> {
    const r = this.#byId.get(id);
    if (r) this.#byId.set(id, { ...r, status: 'cancelled', completedBy: by, completedAt: at });
    return Promise.resolve();
  }
}

/** Defects held in memory; `statusChanges` records every change made through it. */
export class InMemoryDefectDirectory implements DefectDirectory {
  readonly #byId = new Map<DefectId, DefectInfo>();
  readonly statusChanges: { defectId: DefectId; status: string; staffId: StaffId }[] = [];

  add(defect: DefectInfo): void {
    this.#byId.set(defect.id, defect);
  }

  find(defectId: DefectId): Promise<DefectInfo | null> {
    return Promise.resolve(this.#byId.get(defectId) ?? null);
  }

  setStatus(defectId: DefectId, status: 'acknowledged' | 'fixed', staffId: StaffId): Promise<void> {
    const d = this.#byId.get(defectId);
    if (d) this.#byId.set(defectId, { ...d, status });
    this.statusChanges.push({ defectId, status, staffId });
    return Promise.resolve();
  }
}
