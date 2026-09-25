import type { Device, DeviceId } from '../../domain/device.js';
import type { DriverId } from '../../domain/driver.js';
import type { DeviceRepository } from '../ports/device-repository.js';

export class InMemoryDeviceRepository implements DeviceRepository {
  #byId = new Map<DeviceId, Device>();

  findByPushToken(pushToken: string): Promise<Device | null> {
    for (const device of this.#byId.values()) {
      if (device.pushToken === pushToken) {
        return Promise.resolve(device);
      }
    }
    return Promise.resolve(null);
  }

  findByDriverId(driverId: DriverId): Promise<Device[]> {
    const matches = [...this.#byId.values()].filter((device) => device.driverId === driverId);
    return Promise.resolve(matches);
  }

  save(device: Device): Promise<void> {
    this.#byId.set(device.id, device);
    return Promise.resolve();
  }

  deleteAllForDriver(driverId: DriverId): Promise<void> {
    for (const [id, device] of this.#byId) {
      if (device.driverId === driverId) {
        this.#byId.delete(id);
      }
    }
    return Promise.resolve();
  }
}
