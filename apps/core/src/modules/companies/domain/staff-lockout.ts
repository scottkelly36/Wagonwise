/**
 * Stops password and code guessing against one account (P2-M1.12). Counted from the audit log's
 * failure entries, so there is no separate counter to keep in step: 5 wrong passwords, or 10
 * wrong sign-in codes, within 15 minutes lock the account's sign-in until the oldest of them is
 * 15 minutes old. Codes get more room because each sign-in allows 5 tries and a fumbled phone
 * shouldn't lock someone out after two attempts.
 */
export const STAFF_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const STAFF_MAX_PASSWORD_FAILURES = 5;
export const STAFF_MAX_CODE_FAILURES = 10;

export function isLockedOut(recent: {
  readonly passwordFailures: number;
  readonly codeFailures: number;
}): boolean {
  return (
    recent.passwordFailures >= STAFF_MAX_PASSWORD_FAILURES ||
    recent.codeFailures >= STAFF_MAX_CODE_FAILURES
  );
}
