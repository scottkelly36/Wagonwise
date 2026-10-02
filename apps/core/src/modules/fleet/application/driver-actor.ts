import type { DriverId } from '../domain/driver-link.js';

/** A signed-in driver acting on their own links. `identifier` is their normalised phone or email,
 *  which is how invitations made before they had an account are matched to them. */
export interface DriverActor {
  readonly kind: 'driver';
  readonly driverId: DriverId;
  readonly identifier: string;
}
