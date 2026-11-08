import { useAuthStore } from '../state/auth-store';

/** Every authenticated API hook in this app only ever renders on the signed-in side (behind
 *  src/app/index.tsx's redirect gate), so a missing access token here is a real wiring bug, not
 *  a state a driver can reach — fails loudly rather than silently calling an API with no auth.
 *  Extracted out of api/use-vehicle-profiles.ts once api/use-route-plans.ts needed the same
 *  thing (M5.4) — the "extract on the second real use" precedent M4.4's testing/fakes.ts set.
 *
 *  One exception: the moment of signing out. The signed-in screens (the map above all) stay mounted for a render or two after the
 *  store says `signedOut`, until the move to the sign-in screen lands (`components/sign-out-redirect.tsx`). Throwing then crashed
 *  the screen and left it blank instead of showing the sign-in page (found 2026-11-08), so a signed-out driver gets an empty token:
 *  any request those screens still make is refused by the server and nothing is shown from it. */
export function useAccessToken(): string {
  const state = useAuthStore((s) => s.state);
  if (state.status === 'signedOut') return '';
  if (state.status !== 'signedIn') {
    throw new Error('useAccessToken: called while not signed in');
  }
  return state.accessToken;
}
