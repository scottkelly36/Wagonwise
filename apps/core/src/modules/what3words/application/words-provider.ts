import type { Result } from '../../../shared/result.js';
import type {
  GeoPoint,
  LookupUnavailable,
  What3wordsAddress,
  WordsNotFound,
} from '../domain/words.js';

/** The what3words service, as this module needs it. `words` is already checked (three dotted lower-case words). */
export interface WordsProvider {
  /** Whether a key is set. Without one every lookup is `LookupUnavailable` and no request is made. */
  readonly enabled: boolean;
  toLocation(words: string): Promise<Result<What3wordsAddress, WordsNotFound | LookupUnavailable>>;
  toWords(point: GeoPoint): Promise<Result<What3wordsAddress, WordsNotFound | LookupUnavailable>>;
}
