import { err, ok, type Result } from '../../../../shared/result.js';
import type { DriverId, VehicleId } from '../../domain/job.js';
import type {
  NavigationProfileProvisioner,
  VehicleUnavailable,
} from '../ports/navigation-profile.js';

/** Hands out a profile id per (driver, vehicle), or reports the vehicle gone; records each ask. */
export class FakeNavigationProfileProvisioner implements NavigationProfileProvisioner {
  readonly asked: { driverId: DriverId; vehicleId: VehicleId }[] = [];

  constructor(private readonly missingVehicles: ReadonlySet<string> = new Set()) {}

  provision(input: {
    driverId: DriverId;
    vehicleId: VehicleId;
  }): Promise<Result<{ profileId: string; vehicleName: string }, VehicleUnavailable>> {
    this.asked.push(input);
    if (this.missingVehicles.has(input.vehicleId)) {
      return Promise.resolve(err({ tag: 'VehicleUnavailable' }));
    }
    return Promise.resolve(
      ok({ profileId: `profile-${input.driverId}-${input.vehicleId}`, vehicleName: 'Scania R450' }),
    );
  }
}
