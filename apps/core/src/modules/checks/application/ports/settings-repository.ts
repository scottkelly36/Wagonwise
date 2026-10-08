import type { CompanyId, StaffId } from '../../domain/check-template.js';
import type { CheckSettings } from '../../domain/settings.js';

export interface SettingsRepository {
  /** The firm's settings, or the defaults (both off) if it has never set any. */
  get(companyId: CompanyId): Promise<CheckSettings>;
  save(companyId: CompanyId, settings: CheckSettings, by: StaffId, at: Date): Promise<void>;
}
