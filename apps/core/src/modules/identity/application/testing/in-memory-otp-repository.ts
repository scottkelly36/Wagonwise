import type { Otp } from '../../domain/otp.js';
import type { OtpRepository } from '../ports/otp-repository.js';

export class InMemoryOtpRepository implements OtpRepository {
  #latestByIdentifier = new Map<string, Otp>();

  findLatestFor(identifier: string): Promise<Otp | null> {
    return Promise.resolve(this.#latestByIdentifier.get(identifier) ?? null);
  }

  save(identifier: string, otp: Otp): Promise<void> {
    this.#latestByIdentifier.set(identifier, otp);
    return Promise.resolve();
  }
}
