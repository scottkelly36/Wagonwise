/**
 * A driver recommending WagonWise to the firm they drive for (docs/modules.md, "Referrals"). Pure rules: the code's shape, and which
 * moves between statuses are allowed and by whom.
 */
export type ReferralStatus = 'signed_up' | 'reward_due' | 'claimed' | 'sent' | 'void';

export interface Referral {
  readonly id: string;
  readonly code: string;
  readonly driverId: string;
  readonly firmName: string;
  readonly status: ReferralStatus;
  /** Given by the driver to claim a reward that is due, and used for that alone. */
  readonly rewardEmail: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** No 0, O, 1, I or L, so a code read out over the phone or copied from a text cannot be misread. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/** A new code from `random` (numbers in [0, 1)), such as "WW-K7Q2MX". */
export function makeCode(random: () => number): string {
  let body = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    body += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)] ?? 'A';
  }
  return `WW-${body}`;
}

/** What staff may set, and from where: paid (signed up → due), sent (claimed → sent), or not qualifying (anything not yet sent). */
export function staffMayMove(from: ReferralStatus, to: 'reward_due' | 'sent' | 'void'): boolean {
  if (to === 'reward_due') return from === 'signed_up';
  if (to === 'sent') return from === 'claimed';
  return from !== 'sent' && from !== 'void';
}

/** A firm's name compared without case, spaces or "Ltd" / "Limited", so the same firm cannot be recorded twice. */
export function firmKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '');
}
