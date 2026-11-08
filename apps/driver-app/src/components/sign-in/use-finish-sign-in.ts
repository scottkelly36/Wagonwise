import type { VerifyOtpResponse } from '@wagonwise/contracts/identity';
import { useRouter } from 'expo-router';

import { useAuthStore } from '../../state/auth-store';

/** What every way of signing in does at the end: keep the tokens and the driver, then go to the app. */
export function useFinishSignIn(): (result: VerifyOtpResponse) => Promise<void> {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);
  return async (result) => {
    await signIn(
      { accessToken: result.accessToken, refreshToken: result.refreshToken },
      result.driver,
    );
    router.replace('/home');
  };
}
