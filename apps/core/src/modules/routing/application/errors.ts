import type { TaggedError } from '../../../shared/result.js';

/** Also returned when a profile exists but belongs to a different driver — see
 *  update-vehicle-profile.ts and delete-vehicle-profile.ts: a mismatched owner looks identical to
 *  a missing profile, rather than leaking whether the id exists for someone else. */
export type VehicleProfileNotFound = TaggedError<'VehicleProfileNotFound'>;
