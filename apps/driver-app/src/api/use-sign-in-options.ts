import { useQuery } from '@tanstack/react-query';
import type { SignInOptions } from '@wagonwise/contracts/identity';

import { ApiError } from './errors';
import { getSignInOptions } from './identity';

/** What a server that does not know the question yet (one deployed before password sign-in) is taken to offer: today's code-only sign-in. */
export const CODE_ONLY: SignInOptions = {
  passwordSignIn: false,
  inviteRequired: true,
  google: false,
  apple: false,
};

/**
 * Which ways in the server offers, before anyone is signed in. A server that answers 404 is an older one, so it gets the code-only
 * screen; any other failure (no signal) is left as an error for the screen to offer a retry, since nothing could be signed in then anyway.
 */
export function useSignInOptions() {
  return useQuery({
    queryKey: ['sign-in-options'],
    queryFn: async (): Promise<SignInOptions> => {
      try {
        return await getSignInOptions();
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return CODE_ONLY;
        throw error;
      }
    },
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
}
