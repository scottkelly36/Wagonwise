import { makeId } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  isResetOpen,
  PASSWORD_RESET_LIFETIME_MS,
  PASSWORD_RESET_MAX_PER_HOUR,
  PASSWORD_RESET_WINDOW_MS,
  type StaffPasswordReset,
} from '../domain/staff-password-reset.js';
import { audit, auditCompanyOf } from './audit.js';
import { sha256Hex } from './hash.js';
import type { StaffDeps } from './staff-deps.js';

/** Unknown, used or expired link: one error, so a link's state is not revealed. */
export type ResetNotUsable = TaggedError<'ResetNotUsable'>;

/**
 * "Forgot your password": emails the account a link to choose a new one. The caller is told nothing about whether the address has an
 * account (the page always says "if it does, we have emailed it"), so nobody can use this to find out who is a customer. An account
 * asked for at most {@link PASSWORD_RESET_MAX_PER_HOUR} links an hour; past that the request is quietly ignored. With no dashboard
 * address configured there is no link to send, so nothing happens. A failed email changes nothing for the caller either.
 */
export async function requestPasswordReset(
  deps: Pick<
    StaffDeps,
    | 'accounts'
    | 'passwordResets'
    | 'resetMailer'
    | 'auditLog'
    | 'randomCodes'
    | 'clock'
    | 'ids'
    | 'dashboardUrl'
  >,
  input: { readonly email: string },
): Promise<void> {
  if (deps.dashboardUrl === undefined) return;
  const account = await deps.accounts.findByEmail(input.email);
  if (account === null) return;
  const now = deps.clock.now();
  const recent = await deps.passwordResets.countSince(
    account.id,
    new Date(now.getTime() - PASSWORD_RESET_WINDOW_MS),
  );
  if (recent >= PASSWORD_RESET_MAX_PER_HOUR) return;

  const token = deps.randomCodes.inviteToken();
  const reset: StaffPasswordReset = {
    id: makeId<'StaffPasswordResetId'>(deps.ids.newId()),
    staffId: account.id,
    tokenHash: sha256Hex(token),
    createdAt: now,
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_LIFETIME_MS),
    usedAt: null,
  };
  await deps.passwordResets.save(reset);
  await audit(deps, {
    action: 'password_reset_requested',
    companyId: auditCompanyOf(account),
    targetId: account.id,
  });
  try {
    await deps.resetMailer.send({
      to: account.email,
      name: account.name,
      link: `${deps.dashboardUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`,
      expiresAt: reset.expiresAt,
    });
  } catch {
    // The person simply gets no email and asks again; nothing here may tell the caller whether the account exists.
  }
}

/**
 * Chooses a new password from the emailed link, once. Every session of the account is ended (whoever had it signed in is out), and
 * the second factor is untouched: the next sign-in still asks for it. The caller has checked the password's length.
 */
export async function resetPassword(
  deps: Pick<
    StaffDeps,
    'accounts' | 'passwordResets' | 'passwordHasher' | 'sessions' | 'auditLog' | 'clock' | 'ids'
  >,
  input: { readonly token: string; readonly password: string },
): Promise<Result<void, ResetNotUsable>> {
  const now = deps.clock.now();
  const reset = await deps.passwordResets.findByTokenHash(sha256Hex(input.token));
  if (reset === null || !isResetOpen(reset, now)) return err({ tag: 'ResetNotUsable' });
  const account = await deps.accounts.findById(reset.staffId);
  const credentials = account === null ? null : await deps.accounts.findCredentials(account.id);
  if (account === null || credentials === null) return err({ tag: 'ResetNotUsable' });
  // Claimed first, so two people opening the same link at the same moment cannot both use it.
  if (!(await deps.passwordResets.markUsed(reset.id, now))) return err({ tag: 'ResetNotUsable' });

  await deps.accounts.saveCredentials({
    ...credentials,
    passwordHash: await deps.passwordHasher.hash(input.password),
  });
  await deps.sessions.revokeAllForStaff(account.id, now);
  await audit(deps, {
    action: 'password_reset',
    companyId: auditCompanyOf(account),
    targetId: account.id,
  });
  return ok(undefined);
}
