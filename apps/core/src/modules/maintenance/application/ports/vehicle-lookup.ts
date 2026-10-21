import type { Result, TaggedError } from '../../../../shared/result.js';
import type { DayString } from '../../domain/maintenance.js';

/** What the government's vehicle record says about one vehicle. Every field is optional: a new vehicle has no MOT yet. */
export interface VehicleDates {
  /** When the MOT runs out. */
  readonly motExpiry?: DayString | undefined;
  /** When the road tax (vehicle excise duty) is next due. */
  readonly taxDue?: DayString | undefined;
  /** The record's own words, such as "Valid", "Not valid" or "No details held by DVLA". */
  readonly motStatus?: string | undefined;
  readonly taxStatus?: string | undefined;
}

/** The registration is not on the record. */
export type LookupNotFound = TaggedError<'LookupNotFound'>;
/** The record could not be reached, or refused the request (a busy day, an outage, a bad key). Try again later. */
export type LookupUnavailable = TaggedError<'LookupUnavailable'>;

/**
 * Looks a vehicle up by registration. Supplied by `infrastructure/`: the DVLA's Vehicle Enquiry Service, once a key is
 * set. Without one, `configured` is false and the portal does not offer the button.
 */
export interface VehicleLookup {
  readonly configured: boolean;
  lookup(registration: string): Promise<Result<VehicleDates, LookupNotFound | LookupUnavailable>>;
}
