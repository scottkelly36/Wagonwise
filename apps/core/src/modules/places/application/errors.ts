import type { TaggedError } from '../../../shared/result.js';

/** The caller is not allowed to do this to this company's places. */
export type Forbidden = TaggedError<'Forbidden'>;
/** An unknown id, or a place of a company the caller cannot see: the same answer, so ids cannot be probed. */
export type PlaceNotFound = TaggedError<'PlaceNotFound'>;
