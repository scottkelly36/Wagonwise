import type { Transaction } from '../../../../shared/ports/unit-of-work.js';
import type { InviteCode } from '../../domain/invite-code.js';

export interface InviteCodeRepository {
  findByCode(code: string): Promise<InviteCode | null>;
  /** The invite-codes admin screen's own read (2026-09-27) — every code, redeemed or not; the
   *  caller decides how to present that (e.g. an "active" filter is a dashboard-side concern,
   *  not this repository's). */
  findAll(): Promise<InviteCode[]>;
  /** See DriverRepository.save's `tx` note — redemption commits with the new Driver. */
  save(invite: InviteCode, tx?: Transaction): Promise<void>;
}
