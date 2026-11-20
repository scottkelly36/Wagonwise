import type { ReferralStatus } from '@wagonwise/contracts/referrals';

/** Each status in plain words, for the portal list. */
export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  signed_up: 'Signed up (free period)',
  reward_due: 'Paid: reward due, waiting for the driver',
  claimed: 'Claimed: send the gift card',
  sent: 'Gift card sent',
  void: 'Does not qualify',
};

/** What staff can do next with a referral, if anything: paid, sent, or not qualifying. */
export function nextActions(
  status: ReferralStatus,
): { readonly to: 'reward_due' | 'sent' | 'void'; readonly label: string }[] {
  const actions: { to: 'reward_due' | 'sent' | 'void'; label: string }[] = [];
  if (status === 'signed_up') actions.push({ to: 'reward_due', label: 'Firm has paid' });
  if (status === 'claimed') actions.push({ to: 'sent', label: 'Gift card sent' });
  if (status !== 'sent' && status !== 'void')
    actions.push({ to: 'void', label: 'Does not qualify' });
  return actions;
}

/** "WW-ABC123" from whatever was typed: spaces dropped, upper case, the WW- added if left off. */
export function normaliseCode(typed: string): string {
  const bare = typed.replace(/\s+/g, '').toUpperCase();
  return bare.startsWith('WW-')
    ? bare
    : bare.startsWith('WW')
      ? `WW-${bare.slice(2)}`
      : `WW-${bare}`;
}
