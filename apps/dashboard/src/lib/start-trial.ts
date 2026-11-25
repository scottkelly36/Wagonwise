import type { TrialStartResponse } from '@wagonwise/contracts/signups';

/**
 * What the page a firm's emailed trial link opens says after it presses "Start my trial". The wording avoids promising what a human at
 * WagonWise will do beyond what the owner has agreed: a firm held for the owner is told it will be set up shortly, nothing more.
 */
export function startTrialOutcome(
  status: Exclude<TrialStartResponse['status'], 'needs_company'>,
  email: string | undefined,
): { readonly title: string; readonly text: string; readonly signIn: boolean } {
  const address = email === undefined ? 'your email address' : email;
  switch (status) {
    case 'started':
      return {
        title: 'Your trial has started',
        text: `We have emailed an invitation to ${address}. Open it to choose your password and sign in. It can take a minute to arrive: check your spam folder if it does not.`,
        signIn: false,
      };
    case 'already_started':
      return {
        title: 'Your trial has already started',
        text: `Look for the invitation we emailed to ${address}. If you have already chosen your password, sign in.`,
        signIn: true,
      };
    case 'waiting':
      return {
        title: 'Thank you',
        text: `We will set up your trial shortly and email ${address} when it is ready. You do not need to do anything.`,
        signIn: false,
      };
    case 'email_in_use':
      return {
        title: 'You already have an account',
        text: `${address} already has a WagonWise account. Sign in, or use "Forgot your password?" on the sign-in page.`,
        signIn: true,
      };
    case 'invalid':
      return {
        title: 'This link has expired',
        text: 'This link is too old or has already been used. Register again at wagon-wise.co.uk/for-hauliers and we will send you a new one.',
        signIn: false,
      };
  }
}
