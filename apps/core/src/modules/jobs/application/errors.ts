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

/** A position was reported for a job that isn't being driven right now (not yet accepted, or
 *  already finished). Nothing is stored. */
export type NotTracking = TaggedError<'NotTracking'>;

/** The job has no vehicle assigned, so there is nothing to navigate it for: the dispatcher has to
 *  assign one. */
export type NoVehicleAssigned = TaggedError<'NoVehicleAssigned'>;

/** The chosen vehicle cannot get between the job's stops: no route exists for its dimensions. */
export type NoRouteForVehicle = TaggedError<'NoRouteForVehicle'>;

/** One active job per vehicle: a lorry cannot carry two drivers' jobs at once. This is what makes a
 *  company's vehicle capacity (billing) mean something. */
export type VehicleBusy = TaggedError<'VehicleBusy'>;

/** The company wants the vehicle's walk-round check done before a driver accepts a job, and it has not been. */
export type CheckRequired = TaggedError<'CheckRequired'>;

/** The company has asked that a vehicle with a "do not drive" defect still open is not sent out, and this one has. */
export type VehicleNotFit = TaggedError<'VehicleNotFit'>;
