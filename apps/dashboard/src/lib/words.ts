import { ApiError } from '../api/errors';

// Letters from any alphabet, three of them, joined by dots (what3words has many languages).
const THREE_WORDS = /^[\p{L}\p{M}]+\.[\p{L}\p{M}]+\.[\p{L}\p{M}]+$/u;

/**
 * The words as what3words wants them (lower case, no `///`, dots between), or `undefined` if what was typed is not exactly three
 * words. People type `///Filled Count Soap`, `filled,count,soap` or `filled count soap`, so spaces, commas and full stops all
 * separate the words. Also the cache key, so the same words never cost two lookups.
 */
export function wordsKey(text: string): string | undefined {
  const cleaned = text
    .trim()
    .replace(/^\/{1,3}/, '')
    .toLowerCase()
    .split(/[\s.,。・]+/u)
    .filter((part) => part.length > 0)
    .join('.');
  return THREE_WORDS.test(cleaned) ? cleaned : undefined;
}

/** What to tell the person when a three-word lookup did not work, in words that say what to do next. */
export function wordsLookupMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.tag === 'InvalidWords') return 'Type exactly three words, like filled.count.soap.';
    if (error.tag === 'WordsNotFound') return 'No square matches those words. Check the spelling.';
    if (error.tag === 'LookupUnavailable' || error.status === 503) {
      return 'Three-word search is not available right now. Use a postcode instead.';
    }
  }
  return 'Could not reach the search. Check your connection and try again.';
}
