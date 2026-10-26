import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { What3wordsAddressDto } from '@wagonwise/contracts/what3words';

import * as what3wordsApi from '../api/what3words';
import { wordsKey } from '../lib/words';
import { useStaffAuthStore } from '../state/staff-auth-store';

const wordsQueryKey = (key: string) => ['words', key] as const;

type WithAccessToken = <T>(call: (accessToken: string) => Promise<T>) => Promise<T>;

const wordsQuery = (key: string, withAccessToken: WithAccessToken) => ({
  queryKey: wordsQueryKey(key),
  queryFn: () => withAccessToken((token) => what3wordsApi.wordsToLocation(token, key)),
  // Each lookup is billed, and a square does not move: the answer to the Find button and the one at submit are one lookup.
  staleTime: Infinity,
  retry: false,
});

/**
 * The spot for three words, looked up only once the person has pressed Find (`searched` is what they pressed it with) and never
 * on every keystroke. Idle until then.
 */
export function useWords(searched: string | undefined) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const key = searched === undefined ? undefined : wordsKey(searched);
  return useQuery<What3wordsAddressDto, Error>({
    ...wordsQuery(key ?? '', withAccessToken),
    enabled: key !== undefined,
  });
}

/** Resolves a stop's three words at submit, reusing the answer Find already got. Throws the lookup's own error. */
export function resolveWords(
  queryClient: QueryClient,
  withAccessToken: WithAccessToken,
  text: string,
): Promise<What3wordsAddressDto> {
  const key = wordsKey(text);
  if (key === undefined) return Promise.reject(new Error('not three words'));
  return queryClient.fetchQuery(wordsQuery(key, withAccessToken));
}
