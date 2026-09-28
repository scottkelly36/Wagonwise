import { err, ok, type Result } from '../../../shared/result.js';
import type { CompanyId, Driver, DriverId, DriverScope } from '../domain/driver.js';
import { requireAdmin, type Forbidden } from './authorization.js';
import type { DriverNotFound } from './errors.js';
import type { DriverRepository } from './ports/driver-repository.js';

export interface UpdateDriverDeps {
  readonly driverRepo: Pick<DriverRepository, 'findById' | 'save'>;
}

export interface UpdateDriverInput {
  /** Who's asking; must be an admin (P2-M1.8). */
  readonly callerId: DriverId;
  readonly id: DriverId;
  /** `undefined` (key omitted entirely): leave unchanged. `null`: clear the assignment — the
   *  driver has no company right now. A real id: assign to that company. Not validated against
   *  companies' own data (no cross-context existence check) — the admin dashboard only ever
   *  offers ids from `GET /companies`'s own list, so this is a trusted-input path, the same class
   *  of trust AGENTS.md already gives admin-driven actions elsewhere. */
  readonly companyId?: CompanyId | null;
  /** `undefined`: leave unchanged. A boolean: set it. */
  readonly isAdmin?: boolean;
  /** `undefined`: leave unchanged. An array (including `[]`): replace the whole set — same
   *  plain-PATCH semantics as `companyId`/`isAdmin`, not a merge/append. */
  readonly scopes?: readonly DriverScope[];
}

export type UpdateDriverError = Forbidden | DriverNotFound;

/** Admin-only (`authorization.ts`, checked before the target is even looked up, so a
 *  non-admin can't learn whether a driver id exists) — the one sanctioned way to change either field
 *  going forward, now that a real user-management screen exists (2026-09-27) rather than
 *  hand-editing the database. Each field is independently optional: passing only one leaves the
 *  other untouched, not reset to a default. */
export async function updateDriver(
  deps: UpdateDriverDeps,
  input: UpdateDriverInput,
): Promise<Result<Driver, UpdateDriverError>> {
  const allowed = await requireAdmin(deps.driverRepo, input.callerId);
  if (!allowed.ok) return allowed;
  const driver = await deps.driverRepo.findById(input.id);
  if (!driver) {
    return err({ tag: 'DriverNotFound' });
  }

  const updated: Driver = {
    ...driver,
    ...(input.companyId !== undefined
      ? { companyId: input.companyId === null ? undefined : input.companyId }
      : {}),
    ...(input.isAdmin !== undefined ? { isAdmin: input.isAdmin } : {}),
    ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
  };
  await deps.driverRepo.save(updated);
  return ok(updated);
}
