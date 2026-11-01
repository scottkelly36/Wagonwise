import type { DriverId } from '../../domain/driver.js';
import type { FederatedIdentity, SocialProvider } from '../../domain/federated-identity.js';

export interface FederatedIdentityRepository {
  find(provider: SocialProvider, subject: string): Promise<FederatedIdentity | null>;
  /** Insert-or-update by (provider, subject), as every repository here. */
  save(identity: FederatedIdentity): Promise<void>;
  /** Account deletion removes every link a driver has. */
  deleteForDriver(driverId: DriverId): Promise<void>;
}
