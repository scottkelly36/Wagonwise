import type { Transaction } from '../../../../shared/ports/unit-of-work.js';
import type { Driver, DriverId } from '../../domain/driver.js';

export interface DriverRepository {
  findByIdentifier(identifier: string): Promise<Driver | null>;
  findById(id: DriverId): Promise<Driver | null>;
  /** Every driver — the user-management screen's own read (2026-09-27), admin-gated at the
   *  interface layer (`interface/routes.ts`'s `GET /identity/drivers`), never called from
   *  anywhere a non-admin request could reach. */
  findAll(): Promise<Driver[]>;
  /**
   * Upsert — a Driver is created once (`verify-otp.ts`) but now also mutates in place (M8:
   * `consent()`, `anonymize()`), same "save is upsert" convention every other repository in this
   * codebase uses. Accepts an optional `tx` so creating a Driver and redeeming its InviteCode can
   * commit together (verify-otp.ts, via UnitOfWork) rather than as two independent writes.
   */
  save(driver: Driver, tx?: Transaction): Promise<void>;
}
