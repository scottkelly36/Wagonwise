import {
  what3wordsAddressSchema,
  type What3wordsAddressDto,
} from '@wagonwise/contracts/what3words';

import { requestJson, throwUnlessSuccess } from './http';

/** Three words (as typed: with or without `///`, dots or spaces) to the spot they name. Throws an ApiError tagged `InvalidWords`,
 *  `WordsNotFound` or `LookupUnavailable`. */
export async function wordsToLocation(
  accessToken: string,
  words: string,
): Promise<What3wordsAddressDto> {
  const { status, json } = await requestJson('POST', '/what3words/to-location', {
    body: { words },
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return what3wordsAddressSchema.parse(json);
}

/** A position to the three words for its 3 m square. */
export async function locationToWords(
  accessToken: string,
  location: { lat: number; lon: number },
): Promise<What3wordsAddressDto> {
  const { status, json } = await requestJson('POST', '/what3words/to-words', {
    body: { location },
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return what3wordsAddressSchema.parse(json);
}
