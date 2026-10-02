import type { TaggedError } from '../../../shared/result.js';

/** The caller may see this company's jobs but not act on them (`authorization.ts`). */
export type Forbidden = TaggedError<'Forbidden'>;

/** Unknown id, or a job in a company the caller can't see: same answer, so ids can't be probed. */
export type JobNotFound = TaggedError<'JobNotFound'>;

export type DriverNotInCompany = TaggedError<'DriverNotInCompany'>;
export type VehicleNotInCompany = TaggedError<'VehicleNotInCompany'>;

/** One active job per driver (design doc §3). */
export type DriverBusy = TaggedError<'DriverBusy'>;
