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

/** The driver gives (or clears) the name their companies see them by. */
export function useSetDriverName() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: (name: string) => identityApi.setDriverName(accessToken, name),
  });
}

/** Design doc §9's "a way for a tester to delete their account and data" (M8). */
export function useDeleteAccount() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: () => identityApi.deleteAccount(accessToken),
  });
}

/** A driver with no password adds one (signed in already). */
export function useSetPassword() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: (password: string) => identityApi.setPassword(accessToken, password),
  });
}

/** Adding an email to a phone-number account, step 1: emails a code to it. */
export function useRequestAddEmail() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: (email: string) => identityApi.requestAddEmail(accessToken, email),
  });
}

/** Step 2: the code. The email becomes the sign-in; the updated driver comes back. */
export function useConfirmAddEmail() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: (input: { readonly email: string; readonly code: string }) =>
      identityApi.confirmAddEmail(accessToken, input.email, input.code),
  });
}
