import type { Result, TaggedError } from '../../../../shared/result.js';
import type { DriverId, VehicleId } from '../../domain/job.js';

/** The vehicle could not be turned into a routing profile: it no longer exists, or its recorded
 *  measurements are not usable. An expected outcome, not a fault. */
export type VehicleUnavailable = TaggedError<'VehicleUnavailable'>;

/**
 * What a driver needs in order to be navigated for a job, in jobs' own terms (AGENTS.md rule 7): a
 * routing profile that carries the measurements of the company vehicle the job is assigned to. The
 * adapter lives in `composition/`, reading the vehicle from `fleet` and writing the profile through
 * `routing`, so `jobs` knows about neither.
 */
export interface NavigationProfileProvisioner {
  provision(input: {
    readonly driverId: DriverId;
    readonly vehicleId: VehicleId;
  }): Promise<
    Result<{ readonly profileId: string; readonly vehicleName: string }, VehicleUnavailable>
  >;
}
