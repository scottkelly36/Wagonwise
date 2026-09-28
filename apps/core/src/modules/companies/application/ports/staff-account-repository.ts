import type { CompanyId } from '../../domain/company.js';
import type { StaffAccount, StaffId } from '../../domain/staff-account.js';
import type { StaffCredentials } from '../../domain/staff-credentials.js';

export interface StaffAccountRepository {
  /** Creates the account with its credentials. Accounts are never created without them. */
  create(account: StaffAccount, credentials: StaffCredentials): Promise<void>;
  /** Updates name and privileges; never credentials (see `saveCredentials`). */
  save(account: StaffAccount): Promise<void>;
  saveCredentials(credentials: StaffCredentials): Promise<void>;
  /** Live accounts only: a removed account is treated as not existing. */
  findById(id: StaffId): Promise<StaffAccount | null>;
  /** Case-insensitive; live accounts only. */
  findByEmail(email: string): Promise<StaffAccount | null>;
  findCredentials(id: StaffId): Promise<StaffCredentials | null>;
  listByCompany(companyId: CompanyId): Promise<StaffAccount[]>;
  /** Every live account, platform staff first. For WagonWise admins. */
  listAll(): Promise<StaffAccount[]>;
  /** How many live fleet users in the company hold `manage_users` (the last-manager rule). */
  countManagers(companyId: CompanyId): Promise<number>;
  remove(id: StaffId, at: Date): Promise<void>;
}
