import type { CompanyId } from '../../domain/company.js';
import type { StaffInvite, StaffInviteId } from '../../domain/staff-invite.js';

export interface StaffInviteRepository {
  /** Upsert: created once, then updated when accepted. */
  save(invite: StaffInvite): Promise<void>;
  findById(id: StaffInviteId): Promise<StaffInvite | null>;
  findByTokenHash(tokenHash: string): Promise<StaffInvite | null>;
  /** Newest first. */
  listByCompany(companyId: CompanyId): Promise<StaffInvite[]>;
}
