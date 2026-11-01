import type { DriverId } from '../../domain/driver.js';
import type { DriverCredential } from '../../domain/password.js';
import type { CredentialRepository } from '../ports/credential-repository.js';

export class InMemoryCredentialRepository implements CredentialRepository {
  #byDriver = new Map<DriverId, DriverCredential>();

  findByDriverId(driverId: DriverId): Promise<DriverCredential | null> {
    return Promise.resolve(this.#byDriver.get(driverId) ?? null);
  }

  save(credential: DriverCredential): Promise<void> {
    this.#byDriver.set(credential.driverId, credential);
    return Promise.resolve();
  }

  deleteForDriver(driverId: DriverId): Promise<void> {
    this.#byDriver.delete(driverId);
    return Promise.resolve();
  }
}
