import type { Transaction } from '../../../../shared/ports/unit-of-work.js';
import type { InviteCode } from '../../domain/invite-code.js';

export interface InviteCodeRepository {
  findByCode(code: string): Promise<InviteCode | null>;
  /** See DriverRepository.save's `tx` note — redemption commits with the new Driver. */
  save(invite: InviteCode, tx?: Transaction): Promise<void>;
}
