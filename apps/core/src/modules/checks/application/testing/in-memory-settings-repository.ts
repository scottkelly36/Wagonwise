import type { CompanyId, StaffId } from '../../domain/check-template.js';
import { DEFAULT_SETTINGS, type CheckSettings } from '../../domain/settings.js';
import type { SettingsRepository } from '../ports/settings-repository.js';

export class InMemorySettingsRepository implements SettingsRepository {
  readonly #byCompany = new Map<CompanyId, CheckSettings>();
  lastChangedBy: StaffId | undefined;

  get(companyId: CompanyId): Promise<CheckSettings> {
    return Promise.resolve(this.#byCompany.get(companyId) ?? DEFAULT_SETTINGS);
  }

  save(companyId: CompanyId, settings: CheckSettings, by: StaffId): Promise<void> {
    this.#byCompany.set(companyId, settings);
    this.lastChangedBy = by;
    return Promise.resolve();
  }
}
