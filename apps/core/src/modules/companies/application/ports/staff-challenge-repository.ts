import type { StaffChallenge, StaffChallengeId } from '../../domain/staff-challenge.js';

export interface StaffChallengeRepository {
  /** Upsert: created once, then updated as attempts are counted and when it's used. */
  save(challenge: StaffChallenge): Promise<void>;
  findById(id: StaffChallengeId): Promise<StaffChallenge | null>;
}
