import { ok, type Result } from '../../../shared/result.js';
import type { DriverId } from '../domain/driver.js';
import type { InviteCode } from '../domain/invite-code.js';
import { requireAdmin, type Forbidden } from './authorization.js';
import type { DriverRepository } from './ports/driver-repository.js';
import type { InviteCodeRepository } from './ports/invite-code-repository.js';

export interface ListInviteCodesDeps {
  readonly repo: Pick<InviteCodeRepository, 'findAll'>;
  readonly driverRepo: Pick<DriverRepository, 'findById'>;
}

/** The invite-codes admin screen's own read (2026-09-27) — every code, redeemed or not; the
 *  screen itself decides how to show "active" vs "used". Admins only (P2-M1.8). */
export async function listInviteCodes(
  deps: ListInviteCodesDeps,
  input: { readonly callerId: DriverId },
): Promise<Result<InviteCode[], Forbidden>> {
  const allowed = await requireAdmin(deps.driverRepo, input.callerId);
  if (!allowed.ok) return allowed;
  return ok(await deps.repo.findAll());
}
