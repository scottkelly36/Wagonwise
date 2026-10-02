/**
 * Whose rows a piece of work may see, enforced by Postgres Row-Level Security (P2-M1.7,
 * migration 0021). Every table with RLS refuses all rows unless the work runs inside one of
 * these:
 *
 * - `company`: that company's rows only (a fleet user, or a company-scoped driver on the interim
 *   fleet routes).
 * - `platform`: every company's rows (WagonWise admins). Explicit, not a bypass role.
 * - `staff-auth`: the staff tables only, for the steps that must find an account before anyone's
 *   company is known (sign-in, second factor, refresh, accepting an invite, and loading the
 *   signed-in account on each request). Used by those steps and nothing else.
 * - `driver`: one driver's own driver links, and the invitations made for their identifier
 *   (P2-M2): joining a company with its code, answering an invitation, leaving. No company is in
 *   play yet at that point, so it can't be a `company` scope.
 */
export type DataScope =
  | { readonly kind: 'company'; readonly companyId: string }
  | { readonly kind: 'platform' }
  | { readonly kind: 'staff-auth' }
  | { readonly kind: 'driver'; readonly driverId: string; readonly identifier: string };

/**
 * Runs `work` in one database transaction with `scope` applied. Commits when `work` resolves
 * (including when it returns an error `Result`: a failed code attempt must still be recorded),
 * rolls back if it throws. Not nestable, and `UnitOfWork.run` must not be called inside it.
 */
export interface DataScopes {
  run<T>(scope: DataScope, work: () => Promise<T>): Promise<T>;
}
