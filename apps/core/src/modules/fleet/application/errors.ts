import type { TaggedError } from '../../../shared/result.js';

export type FleetVehicleNotFound = TaggedError<'FleetVehicleNotFound'>;

/** The caller may see this company's fleet but not change it (`authorization.ts`). */
export type Forbidden = TaggedError<'Forbidden'>;
