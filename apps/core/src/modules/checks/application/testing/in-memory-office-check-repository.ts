import type { CompanyId, StaffId, VehicleId } from '../../domain/check-template.js';
import type { CheckId } from '../../domain/check.js';
import type {
  CheckDetail,
  CheckSummary,
  DefectId,
  DefectRecord,
  DefectStatus,
} from '../../domain/office.js';
import type { OfficeCheckRepository, StoredCheckPhoto } from '../ports/office-check-repository.js';

const SEVERITY_RANK = { do_not_drive: 0, advisory: 1 } as const;

export class InMemoryOfficeCheckRepository implements OfficeCheckRepository {
  readonly #checks = new Map<CheckId, CheckDetail>();
  readonly #photos = new Map<string, StoredCheckPhoto>();

  /** Seeds a check, with the defects it found and any photos. */
  add(check: CheckDetail, photos: Record<string, StoredCheckPhoto> = {}): void {
    this.#checks.set(check.id, check);
    for (const [itemId, photo] of Object.entries(photos)) {
      this.#photos.set(`${check.id}/${itemId}`, photo);
    }
  }

  listSummaries(companyId: CompanyId, fromDay: string, toDay: string): Promise<CheckSummary[]> {
    return Promise.resolve(
      [...this.#checks.values()]
        .filter((c) => c.companyId === companyId && c.checkDay >= fromDay && c.checkDay <= toDay)
        .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
        .map((c): CheckSummary => ({
          id: c.id,
          companyId: c.companyId,
          templateId: c.templateId,
          templateName: c.templateName,
          vehicleId: c.vehicleId,
          vehicleName: c.vehicleName,
          driverId: c.driverId,
          checkDay: c.checkDay,
          submittedAt: c.submittedAt,
          result: c.result,
          defectCount: c.defects.length,
        })),
    );
  }

  findDetail(id: CheckId): Promise<CheckDetail | null> {
    return Promise.resolve(this.#checks.get(id) ?? null);
  }

  findPhoto(checkId: CheckId, itemId: string): Promise<StoredCheckPhoto | null> {
    return Promise.resolve(this.#photos.get(`${checkId}/${itemId}`) ?? null);
  }

  listDefects(companyId: CompanyId, statuses: readonly DefectStatus[]): Promise<DefectRecord[]> {
    return Promise.resolve(
      [...this.#checks.values()]
        .filter((c) => c.companyId === companyId)
        .flatMap((c) => c.defects)
        .filter((d) => statuses.includes(d.status))
        .sort(
          (a, b) =>
            SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        ),
    );
  }

  findDefect(id: DefectId): Promise<DefectRecord | null> {
    for (const check of this.#checks.values()) {
      const found = check.defects.find((d) => d.id === id);
      if (found !== undefined) return Promise.resolve(found);
    }
    return Promise.resolve(null);
  }

  vehicleHasUnfixedDoNotDrive(vehicleId: VehicleId): Promise<boolean> {
    return Promise.resolve(
      [...this.#checks.values()]
        .flatMap((c) => c.defects)
        .some(
          (d) => d.vehicleId === vehicleId && d.severity === 'do_not_drive' && d.status !== 'fixed',
        ),
    );
  }

  setDefectStatus(id: DefectId, status: DefectStatus, by: StaffId, at: Date): Promise<void> {
    for (const [checkId, check] of this.#checks) {
      if (check.defects.some((d) => d.id === id)) {
        this.#checks.set(checkId, {
          ...check,
          defects: check.defects.map((d) =>
            d.id === id ? { ...d, status, statusChangedAt: at, statusChangedBy: by } : d,
          ),
        });
      }
    }
    return Promise.resolve();
  }
}
