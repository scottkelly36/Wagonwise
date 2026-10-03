import type { TaggedError } from '../../../shared/result.js';

/** The caller may see this company's jobs but not act on them (`authorization.ts`). */
export type Forbidden = TaggedError<'Forbidden'>;

/** Unknown id, or a job in a company the caller can't see: same answer, so ids can't be probed. */
export type JobNotFound = TaggedError<'JobNotFound'>;

export type DriverNotInCompany = TaggedError<'DriverNotInCompany'>;
export type VehicleNotInCompany = TaggedError<'VehicleNotInCompany'>;

/** One active job per driver (design doc §3). */
export type DriverBusy = TaggedError<'DriverBusy'>;

/** `delivered` refused: the job's dispatcher marked it as needing proof of delivery, and none has
 *  been attached yet (P2-M5.5). */
export type ProofOfDeliveryRequired = TaggedError<'ProofOfDeliveryRequired'>;

/** The job exists and is visible, but no driver has attached a photo to it. */
export type ProofOfDeliveryNotFound = TaggedError<'ProofOfDeliveryNotFound'>;
