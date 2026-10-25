import { z } from 'zod';
import { geoPointSchema } from './routing.js';

/** `POST /what3words/to-location`: three words (with or without the leading `///`) to the spot they name. */
export const wordsToLocationRequestSchema = z.object({
  words: z.string().trim().min(1).max(120),
});
export type WordsToLocationRequest = z.infer<typeof wordsToLocationRequestSchema>;

/** `POST /what3words/to-words`: a position to the three words for its 3 m square. */
export const locationToWordsRequestSchema = z.object({
  location: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
});
export type LocationToWordsRequest = z.infer<typeof locationToWordsRequestSchema>;

/** A what3words address: the words, the middle of its 3 m square, and the nearest town, which is how a driver spots a mistyped word
 *  (a square in the wrong county). */
export const what3wordsAddressSchema = z.object({
  /** Always three words joined by dots, lower case, without the `///`. */
  words: z.string(),
  location: geoPointSchema,
  nearestPlace: z.string().optional(),
  /** Two-letter country code. */
  country: z.string().optional(),
});
export type What3wordsAddressDto = z.infer<typeof what3wordsAddressSchema>;

/** The tags a what3words request can fail with: not three words, no such square, or the lookup is switched off or down. */
export const what3wordsErrorSchema = z.object({
  tag: z.enum(['InvalidWords', 'WordsNotFound', 'LookupUnavailable']),
  requestId: z.string(),
});
export type What3wordsError = z.infer<typeof what3wordsErrorSchema>;
