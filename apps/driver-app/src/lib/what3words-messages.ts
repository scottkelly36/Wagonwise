import { ApiError } from '../api/errors';

/** What to tell a driver when a three-word lookup did not work, in words that say what to do next. */
export function wordsLookupMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.tag === 'InvalidWords') {
      return 'Type exactly three words, like filled.count.soap.';
    }
    if (error.tag === 'WordsNotFound') {
      return 'No square matches those words. Check the spelling.';
    }
    if (error.tag === 'LookupUnavailable' || error.status === 503) {
      return 'Three-word search is not available right now. Search by address or postcode instead.';
    }
  }
  return 'Could not reach the search. Check your signal and try again.';
}
