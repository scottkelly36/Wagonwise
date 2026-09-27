import type { Id } from '../../../shared/brand.js';

export type CompanyId = Id<'CompanyId'>;
/** Same brand name as identity's own `DriverId`, declared here rather than imported (decision 46)
 *  — needed only for the admin-check port (`application/ports/admin-directory.ts`). */
export type DriverId = Id<'DriverId'>;

/** Just a name, for now (2026-09-27) — no billing, no contacts, nothing speculative until a real
 *  business account needs it. Created via the admin dashboard, not seeded by SQL like invite
 *  codes still are — creating a company has no domain rule beyond "the name isn't blank" (already
 *  enforced by contracts' `createCompanyRequestSchema`), so there's nothing here worth a use case
 *  couldn't already say in one line (see `application/create-company.ts`). */
export interface Company {
  readonly id: CompanyId;
  readonly name: string;
  readonly createdAt: Date;
}
