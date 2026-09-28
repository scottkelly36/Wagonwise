import type { Caller, CallerDirectory } from '../ports/caller-directory.js';
import type { DriverId } from '../../domain/vehicle.js';

/** A fixed table of driverId -> Caller, for route tests that need to control exactly what the
 *  authorization check sees without a real identity module. */
export class StubCallerDirectory implements CallerDirectory {
  constructor(private readonly callers: ReadonlyMap<DriverId, Caller>) {}

  getCaller(driverId: DriverId): Promise<Caller | null> {
    return Promise.resolve(this.callers.get(driverId) ?? null);
  }
}
