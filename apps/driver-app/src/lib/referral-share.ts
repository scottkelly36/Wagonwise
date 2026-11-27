import type { ReferralStatus } from '@wagonwise/contracts/referrals';

export const HAULIERS_URL = 'https://wagon-wise.co.uk/for-hauliers/';
/** The form on the For hauliers page: a firm gives its email and is sent a link that starts its own trial. */
export const HAULIERS_SIGNUP_URL = `${HAULIERS_URL}#signup`;
export const REFERRAL_TERMS_URL = 'https://wagon-wise.co.uk/for-hauliers/#refer';

/** The message a driver sends their boss: who it is from, what it is, the link, and the code to give when signing up. */
export function shareMessage(code: string, name: string | null): string {
  const from = name === null || name.trim() === '' ? 'I' : `${name.trim()} here. I`;
  return `${from} use the WagonWise app and think its office side would suit us: jobs to the drivers' phones, walk-round checks and MOT dates in one place, and what each job made. Short video and the details: ${HAULIERS_URL}\nIf we sign up, please give them my code ${code}.`;
}

/** Each status in a driver's own words. */
export const STATUS_TEXT: Record<ReferralStatus, string> = {
  signed_up: 'Signed up. Your reward is due when they pay their first bill.',
  reward_due: 'They have paid. Tell us where to send your gift card.',
  claimed: 'Claimed. We will send your gift card soon.',
  sent: 'Gift card sent. Thank you!',
  void: 'Does not qualify.',
};
