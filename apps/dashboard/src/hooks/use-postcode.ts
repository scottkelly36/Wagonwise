import { useQuery, type QueryClient } from '@tanstack/react-query';

import {
  lookupPostcode,
  normalisePostcode,
  PostcodeNotFoundError,
  type ResolvedPostcode,
} from '../lib/postcodes';

const postcodeKey = (postcode: string) => ['postcode', postcode] as const;

const postcodeQuery = (postcode: string) => ({
  queryKey: postcodeKey(postcode),
  queryFn: () => lookupPostcode(postcode),
  // A postcode's point doesn't change inside a session, so every lookup — the live hint under the
  // field and the one at submit — shares one cached answer. Only a genuine outage is retried.
  staleTime: Infinity,
  retry: (failures: number, error: Error) =>
    !(error instanceof PostcodeNotFoundError) && failures < 1,
});

/** Live lookup for the text in a postcode field. Idle until the text is shaped like a postcode,
 *  so nothing is fired on every keystroke. */
export function usePostcode(text: string) {
  const postcode = normalisePostcode(text);
  return useQuery<ResolvedPostcode, Error>({
    ...postcodeQuery(postcode ?? ''),
    enabled: postcode !== undefined,
  });
}

/** Resolves a postcode field's text at submit, reusing the cached live lookup when there is one.
 *  Throws `PostcodeNotFoundError` for text that isn't a real postcode. */
export function resolvePostcode(queryClient: QueryClient, text: string) {
  const postcode = normalisePostcode(text);
  if (postcode === undefined) return Promise.reject(new PostcodeNotFoundError(text.trim()));
  return queryClient.fetchQuery(postcodeQuery(postcode));
}
