import type { Transaction } from '../../../../shared/ports/unit-of-work.js';
import type { DriverId } from '../../domain/driver.js';
import type { DriverCredential } from '../../domain/password.js';

export interface CredentialRepository {
  findByDriverId(driverId: DriverId): Promise<DriverCredential | null>;
  /** Upsert, as every repository here. A `tx` lets a new driver and their password commit together. */
  save(credential: DriverCredential, tx?: Transaction): Promise<void>;
  /** Account deletion removes the password with everything else. */
  deleteForDriver(driverId: DriverId): Promise<void>;
}
