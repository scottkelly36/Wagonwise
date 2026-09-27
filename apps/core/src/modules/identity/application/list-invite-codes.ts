import type { InviteCode } from '../domain/invite-code.js';
import type { InviteCodeRepository } from './ports/invite-code-repository.js';

export interface ListInviteCodesDeps {
  readonly repo: Pick<InviteCodeRepository, 'findAll'>;
}

/** The invite-codes admin screen's own read (2026-09-27) — every code, redeemed or not; the
 *  screen itself decides how to show "active" vs "used". */
export async function listInviteCodes(deps: ListInviteCodesDeps): Promise<InviteCode[]> {
  return deps.repo.findAll();
}
