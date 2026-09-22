import type { Otp } from '../../domain/otp.js';

export interface OtpRepository {
  /** The most recently requested OTP for this identifier, if any — a new request supersedes it
   *  by simple recency, not by explicitly invalidating the old row. */
  findLatestFor(identifier: string): Promise<Otp | null>;
  /** `Otp` deliberately carries no identifier (domain/otp.ts) — the repository is what
   *  associates one with its lookup key. */
  save(identifier: string, otp: Otp): Promise<void>;
}
