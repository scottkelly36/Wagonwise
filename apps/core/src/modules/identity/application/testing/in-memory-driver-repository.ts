import type { Driver, DriverId } from '../../domain/driver.js';
import type { DriverRepository } from '../ports/driver-repository.js';

export class InMemoryDriverRepository implements DriverRepository {
  #byId = new Map<DriverId, Driver>();

  findByIdentifier(identifier: string): Promise<Driver | null> {
    for (const driver of this.#byId.values()) {
      if (driver.identifier === identifier) {
        return Promise.resolve(driver);
      }
    }
    return Promise.resolve(null);
  }

  findById(id: DriverId): Promise<Driver | null> {
    return Promise.resolve(this.#byId.get(id) ?? null);
  }

  findAll(): Promise<Driver[]> {
    return Promise.resolve([...this.#byId.values()]);
  }

  save(driver: Driver): Promise<void> {
    this.#byId.set(driver.id, driver);
    return Promise.resolve();
  }
}
