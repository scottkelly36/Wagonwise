import type { Transaction } from '../../../../shared/ports/unit-of-work.js';
import type { Driver, DriverId } from '../../domain/driver.js';

export interface DriverRepository {
  findByIdentifier(identifier: string): Promise<Driver | null>;
  findById(id: DriverId): Promise<Driver | null>;
  /**
   * Insert-only for Phase 1 — nothing about a Driver changes after creation yet. Accepts an
   * optional `tx` so creating a Driver and redeeming its InviteCode can commit together
   * (verify-otp.ts, via UnitOfWork) rather than as two independent writes.
   */
  save(driver: Driver, tx?: Transaction): Promise<void>;
}
