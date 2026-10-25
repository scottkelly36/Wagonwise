import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

/** A what3words address as the service answers it. */
export interface What3wordsAddress {
  readonly words: string;
  readonly location: GeoPoint;
  readonly nearestPlace: string | undefined;
  readonly country: string | undefined;
}

export type InvalidWords = TaggedError<'InvalidWords'>;
/** No such square, or a place the service does not cover. */
export type WordsNotFound = TaggedError<'WordsNotFound'>;
/** The lookup is switched off (no key) or the service did not answer; the caller can still carry on without it. */
export type LookupUnavailable = TaggedError<'LookupUnavailable'>;

// Letters from any alphabet (what3words has many languages), no digits or other marks, three of them.
const WORD = '[\\p{L}\\p{M}]+';
const THREE_WORDS = new RegExp(`^${WORD}\\.${WORD}\\.${WORD}$`, 'u');

/**
 * The words as what3words wants them: lower case, no `///`, dots between. People type `///Filled Count Soap`, `filled,count,soap` or
 * `filled count soap`, so spaces, commas and full stops all separate the words. Anything that is not exactly three words is refused
 * here, before it costs a lookup.
 */
export function parseWords(raw: string): Result<string, InvalidWords> {
  const cleaned = raw
    .trim()
    .replace(/^\/{1,3}/, '')
    .toLowerCase()
    .split(/[\s.,。・]+/u)
    .filter((part) => part.length > 0)
    .join('.');
  return THREE_WORDS.test(cleaned) ? ok(cleaned) : err({ tag: 'InvalidWords' });
}
