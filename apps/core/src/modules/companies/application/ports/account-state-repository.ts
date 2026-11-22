import type {
  AccountSettings,
  AccountState,
  AccountStateMove,
  AccountStatus,
} from '../../domain/account-state.js';
import type { CompanyId } from '../../domain/company.js';

/** Where a company's account state, the settings for every company, and the log of moves are kept. */
export interface AccountStateRepository {
  /** `null` when there is no such company. */
  get(companyId: CompanyId): Promise<AccountState | null>;
  /** Just the status, for the check every staff change goes through. `null` when there is no such company. */
  getStatus(companyId: CompanyId): Promise<AccountStatus | null>;
  /** Every company's state, for the admin list. */
  getAll(): Promise<readonly AccountState[]>;
  save(state: AccountState): Promise<void>;
  appendMove(move: AccountStateMove): Promise<void>;
  getSettings(): Promise<AccountSettings>;
  saveSettings(settings: AccountSettings, byStaffId: string, at: Date): Promise<void>;
}
