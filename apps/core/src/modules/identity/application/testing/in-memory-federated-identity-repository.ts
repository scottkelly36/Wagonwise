import type { DriverId } from '../../domain/driver.js';
import type { FederatedIdentity, SocialProvider } from '../../domain/federated-identity.js';
import type { FederatedIdentityRepository } from '../ports/federated-identity-repository.js';

export class InMemoryFederatedIdentityRepository implements FederatedIdentityRepository {
  #byKey = new Map<string, FederatedIdentity>();

  find(provider: SocialProvider, subject: string): Promise<FederatedIdentity | null> {
    return Promise.resolve(this.#byKey.get(`${provider}:${subject}`) ?? null);
  }

  save(identity: FederatedIdentity): Promise<void> {
    this.#byKey.set(`${identity.provider}:${identity.subject}`, identity);
    return Promise.resolve();
  }

  deleteForDriver(driverId: DriverId): Promise<void> {
    for (const [key, identity] of this.#byKey) {
      if (identity.driverId === driverId) this.#byKey.delete(key);
    }
    return Promise.resolve();
  }
}
