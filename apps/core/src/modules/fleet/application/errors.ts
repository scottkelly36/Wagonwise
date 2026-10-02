import type { TaggedError } from '../../../shared/result.js';

export type FleetVehicleNotFound = TaggedError<'FleetVehicleNotFound'>;

/** The caller may see this company's fleet but not change it (`authorization.ts`). */
export type Forbidden = TaggedError<'Forbidden'>;

/** Unknown id, or a link the actor can't see: the same answer, so ids can't be probed. */
export type LinkNotFound = TaggedError<'LinkNotFound'>;

/** Malformed or unknown company code: one answer for both, so codes can't be guessed apart. */
export type InvalidCode = TaggedError<'InvalidCode'>;

/** The driver already has a live link (invited, requested or active) with that company. */
export type AlreadyLinked = TaggedError<'AlreadyLinked'>;

/** That phone or email already has a pending invitation from this company. */
export type AlreadyInvited = TaggedError<'AlreadyInvited'>;
