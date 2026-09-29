import type { Clock } from '../../../shared/ports/clock.js';
import { ok, type Result } from '../../../shared/result.js';
import type { InviteCode } from '../domain/invite-code.js';
import { requirePlatformStaff, type Forbidden } from './authorization.js';
import type { PlatformStaffDirectory, StaffId } from './ports/platform-staff.js';
import type { InviteCodeGenerator } from './ports/invite-code-generator.js';
import type { InviteCodeRepository } from './ports/invite-code-repository.js';

export interface CreateInviteCodeDeps {
  readonly repo: Pick<InviteCodeRepository, 'save'>;
  readonly generator: InviteCodeGenerator;
  readonly clock: Clock;
  readonly staff: PlatformStaffDirectory;
}

/** The invite-codes admin screen's own "Generate code" action (2026-09-27) — replaces the
 *  manual `insert into identity.invite_codes` the README used to point at (see its own comment,
 *  now stale: "no admin endpoint to create invite codes yet, that's staff-portal territory").
 *  No input at all: the code itself is generated, not chosen, and every fresh code starts
 *  unredeemed. WagonWise admins only. */
export async function createInviteCode(
  deps: CreateInviteCodeDeps,
  input: { readonly callerId: StaffId },
): Promise<Result<InviteCode, Forbidden>> {
  const allowed = await requirePlatformStaff(deps.staff, input.callerId);
  if (!allowed.ok) return allowed;
  const invite: InviteCode = {
    code: deps.generator.next(),
    redeemedBy: null,
    redeemedAt: null,
    createdAt: deps.clock.now(),
  };
  await deps.repo.save(invite);
  return ok(invite);
}
