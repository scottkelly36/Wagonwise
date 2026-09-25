import { useMutation } from '@tanstack/react-query';

import { useAccessToken } from '../hooks/use-access-token';
import * as identityApi from './identity';

/** Design doc §9's privacy notice/consent screen (M8) — an action a driver takes once (tap
 *  "I understand"), not data a screen fetches. */
export function useGiveConsent() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: () => identityApi.giveConsent(accessToken),
  });
}

/** Design doc §9's "a way for a tester to delete their account and data" (M8). */
export function useDeleteAccount() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: () => identityApi.deleteAccount(accessToken),
  });
}
