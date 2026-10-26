import {
  what3wordsAddressSchema,
  type What3wordsAddressDto,
} from '@wagonwise/contracts/what3words';

import { requestJson, throwUnlessSuccess } from './http';

/** Three words (as typed: with or without `///`, dots or spaces) to the spot they name, with the nearest town. Throws an ApiError
 *  tagged `InvalidWords`, `WordsNotFound` or `LookupUnavailable`. One lookup is billed each time, so ask only when the person does. */
export async function wordsToLocation(
  accessToken: string,
  words: string,
): Promise<What3wordsAddressDto> {
  const { status, json } = await requestJson('POST', '/staff/what3words/to-location', {
    body: { words },
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return what3wordsAddressSchema.parse(json);
}
