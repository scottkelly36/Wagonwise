import { err, type Result } from '../../../shared/result.js';
import {
  parseWords,
  type GeoPoint,
  type InvalidWords,
  type LookupUnavailable,
  type What3wordsAddress,
  type WordsNotFound,
} from '../domain/words.js';
import type { WordsProvider } from './words-provider.js';

export type LookupError = InvalidWords | WordsNotFound | LookupUnavailable;

/** Three words to the spot they name. Not three words: refused without asking the service. */
export async function wordsToLocation(
  provider: WordsProvider,
  raw: string,
): Promise<Result<What3wordsAddress, LookupError>> {
  const words = parseWords(raw);
  if (!words.ok) return err(words.error);
  if (!provider.enabled) return err({ tag: 'LookupUnavailable' });
  return provider.toLocation(words.value);
}

/** A position to its three words. */
export async function locationToWords(
  provider: WordsProvider,
  point: GeoPoint,
): Promise<Result<What3wordsAddress, WordsNotFound | LookupUnavailable>> {
  if (!provider.enabled) return err({ tag: 'LookupUnavailable' });
  return provider.toWords(point);
}
