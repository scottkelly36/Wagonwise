import type { Transaction } from '../../../../shared/ports/unit-of-work.js';
import type { Driver, DriverId } from '../../domain/driver.js';

export interface DriverRepository {
  findByIdentifier(identifier: string): Promise<Driver | null>;
  findById(id: DriverId): Promise<Driver | null>;
  /** Every driver — the driver-accounts screen's read (`GET /staff/drivers`), only after
   *  `list-drivers.ts` has checked the caller is a WagonWise admin. */
  findAll(): Promise<Driver[]>;
  /**
   * Upsert — a Driver is created once (`verify-otp.ts`) but now also mutates in place (M8:
   * `consent()`, `anonymize()`), same "save is upsert" convention every other repository in this
   * codebase uses. Accepts an optional `tx` so creating a Driver and redeeming its InviteCode can
   * commit together (verify-otp.ts, via UnitOfWork) rather than as two independent writes.
   */
  save(driver: Driver, tx?: Transaction): Promise<void>;
}
