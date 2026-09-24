import type { Device } from '../../domain/device.js';
import type { DriverId } from '../../domain/driver.js';

export interface DeviceRepository {
  findByPushToken(pushToken: string): Promise<Device | null>;
  /** Every device currently registered to a driver — the read-model routing's future reroute
   *  subscriber needs (design doc §6: "device tokens come from a read-model port onto
   *  Identity"), exposed on `identity/api.ts`'s facade once M6.4 has a real caller. */
  findByDriverId(driverId: DriverId): Promise<Device[]>;
  /** Upsert, keyed by `pushToken` — `registerDevice` decides whether a row already exists. */
  save(device: Device): Promise<void>;
}
