import type { Result } from '../../../shared/result.js';
import type { Closure, ClosureSourceUnavailable } from '../domain/closure.js';

/** National Highways' Road and Lane Closures feed, as this module needs it: every closure in force or planned, in one go. */
export interface ClosureSource {
  /** Whether an API key is set. Without one every fetch is `ClosureSourceUnavailable` and no request is made. */
  readonly enabled: boolean;
  /** The closures worth keeping (see `isWorthKeeping`), already tidied. */
  fetchClosures(): Promise<Result<readonly Closure[], ClosureSourceUnavailable>>;
}
