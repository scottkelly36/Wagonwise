import type { AccountEmailKindDto, AccountStatusDto } from '@wagonwise/contracts/companies';

/** What the owner picks from when writing to a company about its account, in the order they usually come. */
export const ACCOUNT_EMAIL_OPTIONS: readonly {
  readonly kind: AccountEmailKindDto;
  readonly label: string;
  /** The state the company must be in for the real email: the wording is about that state. */
  readonly state: AccountStatusDto;
}[] = [
  { kind: 'trial_14', label: 'Free period ends in about 14 days', state: 'trial' },
  { kind: 'trial_7', label: 'Free period ends in about 7 days', state: 'trial' },
  { kind: 'overdue', label: 'Payment is overdue', state: 'overdue' },
  { kind: 'overdue_week', label: 'Payment is still overdue (a week on)', state: 'overdue' },
  { kind: 'paused', label: 'Account has been paused', state: 'paused' },
];

/** Whether the real email can be sent to a company in this state. A test copy can always be sent. */
export function canSendToCompany(kind: AccountEmailKindDto, status: AccountStatusDto): boolean {
  return ACCOUNT_EMAIL_OPTIONS.find((o) => o.kind === kind)?.state === status;
}

/** The line shown after a send. */
export function sentMessage(
  to: 'company' | 'me',
  result: { readonly sent: number; readonly alreadySent: boolean },
): string {
  if (to === 'me') return 'A test copy has been sent to your own address.';
  if (result.alreadySent) {
    return 'That email has already gone to this company for this occasion, so nothing was sent.';
  }
  return `Sent to ${result.sent} ${result.sent === 1 ? 'person' : 'people'} at the company.`;
}
