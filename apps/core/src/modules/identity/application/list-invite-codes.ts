import { ok, type Result } from '../../../shared/result.js';
import type { InviteCode } from '../domain/invite-code.js';
import { requirePlatformStaff, type Forbidden } from './authorization.js';
import type { PlatformStaffDirectory, StaffId } from './ports/platform-staff.js';
import type { InviteCodeRepository } from './ports/invite-code-repository.js';

export interface ListInviteCodesDeps {
  readonly repo: Pick<InviteCodeRepository, 'findAll'>;
  readonly staff: PlatformStaffDirectory;
}

/** The invite-codes admin screen's own read (2026-09-27) — every code, redeemed or not; the
 *  screen itself decides how to show "active" vs "used". WagonWise admins only. */
export async function listInviteCodes(
  deps: ListInviteCodesDeps,
  input: { readonly callerId: StaffId },
): Promise<Result<InviteCode[], Forbidden>> {
  const allowed = await requirePlatformStaff(deps.staff, input.callerId);
  if (!allowed.ok) return allowed;
  return ok(await deps.repo.findAll());
}
