import type { CheckTemplateId, CompanyId, VehicleId } from '../../domain/check-template.js';
import type { Check, CheckId } from '../../domain/check.js';
import type { CheckPhoto, CheckRepository } from '../ports/check-repository.js';

export class InMemoryCheckRepository implements CheckRepository {
  readonly #checks = new Map<CheckId, Check>();
  readonly defectIds = new Map<CheckId, readonly string[]>();
  /** `checkId/itemId` to the photo, for tests to assert on. */
  readonly photos = new Map<string, CheckPhoto>();

  findById(id: CheckId): Promise<Check | null> {
    return Promise.resolve(this.#checks.get(id) ?? null);
  }

  doneOnDay(templateId: CheckTemplateId, vehicleId: VehicleId, day: string): Promise<boolean> {
    return Promise.resolve(
      [...this.#checks.values()].some(
        (c) => c.templateId === templateId && c.vehicleId === vehicleId && c.checkDay === day,
      ),
    );
  }

  save(check: Check, defectIds: readonly string[]): Promise<void> {
    this.#checks.set(check.id, check);
    this.defectIds.set(check.id, defectIds);
    return Promise.resolve();
  }

  /** Records the cutoff asked for, for tests; this fake keeps no defect statuses, so the real rule is tested on Postgres. */
  readonly deleteCalls: { companyId: CompanyId; cutoff: Date }[] = [];
  deleteResult = 0;

  deleteOlderThan(companyId: CompanyId, cutoff: Date): Promise<number> {
    this.deleteCalls.push({ companyId, cutoff });
    return Promise.resolve(this.deleteResult);
  }

  savePhoto(check: Check, itemId: string, photo: CheckPhoto): Promise<void> {
    this.photos.set(`${check.id}/${itemId}`, photo);
    return Promise.resolve();
  }
}
