import { trialEndsOn as addDays } from './account-state.js';

/**
 * The emails a company is sent about its account (docs/company-account-states-scope.md):
 *
 * - `trial_14`, `trial_7`: the free period ends in about two weeks, and in about one week.
 * - `overdue`, `overdue_week`: payment is overdue (nothing switched off yet); a reminder a week in.
 * - `paused`: the account has been paused, and how to get it back.
 */
export const ACCOUNT_EMAIL_KINDS = [
  'trial_14',
  'trial_7',
  'overdue',
  'overdue_week',
  'paused',
] as const;
export type AccountEmailKind = (typeof ACCOUNT_EMAIL_KINDS)[number];

/** The state a company must be in for an email of this kind to make sense. */
export function stateFor(kind: AccountEmailKind): 'trial' | 'overdue' | 'paused' {
  if (kind === 'trial_14' || kind === 'trial_7') return 'trial';
  return kind === 'paused' ? 'paused' : 'overdue';
}

/** Short names, for the owner's notice. */
export const ACCOUNT_EMAIL_LABEL: Record<AccountEmailKind, string> = {
  trial_14: 'free period ending (14 days)',
  trial_7: 'free period ending (7 days)',
  overdue: 'payment overdue',
  overdue_week: 'payment overdue (reminder)',
  paused: 'account paused',
};

export const SUPPORT_EMAIL = 'support@wagon-wise.co.uk';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

function longDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export interface AccountEmailInput {
  readonly kind: AccountEmailKind;
  readonly recipientName: string;
  readonly companyName: string;
  /** The UK day today (`YYYY-MM-DD`). */
  readonly today: string;
  /** The day the free period ends. Needed for the two trial emails. */
  readonly trialEndsOn: string | null;
  /** The UK day the company went overdue. Used with the grace days to say when the pause would come. */
  readonly overdueSince: string | null;
  readonly graceDays: number;
  /** "Never pause" is set: no day for a pause is promised. */
  readonly hold: boolean;
  /** The portal's address, for the link to the plan page; none if it is not known. */
  readonly dashboardUrl: string | undefined;
}

export interface AccountEmail {
  readonly subject: string;
  readonly text: string;
}

/** The day an overdue company would be paused: `graceDays` after it went overdue. Null with a hold, or when it is not overdue. */
export function pauseDay(input: Pick<AccountEmailInput, 'overdueSince' | 'graceDays' | 'hold'>) {
  if (input.hold || input.overdueSince === null) return null;
  return addDays(input.overdueSince, input.graceDays);
}

function planLine(dashboardUrl: string | undefined): string[] {
  if (dashboardUrl === undefined) return [];
  const base = dashboardUrl.replace(/\/+$/, '');
  return ['', `Your plan, your invoices and what is due are here: ${base}/staff/plan`];
}

function contactLine(): string[] {
  return ['', `Reply to this email or write to ${SUPPORT_EMAIL} and we will sort it out with you.`];
}

/**
 * The wording. Plain and short, and it says only what is built: a paused account can still be read and nothing is deleted; the
 * drivers lose that company's jobs, not the free app. There is no payment page yet, so the way to pay or ask is to write to us.
 */
export function buildAccountEmail(input: AccountEmailInput): AccountEmail {
  const hello = `Hi ${input.recipientName},`;
  const sign = ['', 'WagonWise'];
  const company = input.companyName;

  if (input.kind === 'trial_14' || input.kind === 'trial_7') {
    const ends = input.trialEndsOn;
    if (ends === null) throw new Error('a trial email needs the day the free period ends');
    const left = daysBetween(input.today, ends);
    const when = left <= 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`;
    return {
      subject: `The free period for ${company} on WagonWise ends on ${longDay(ends)}`,
      text: [
        hello,
        '',
        `The free period for ${company} on WagonWise ends ${when}, on ${longDay(ends)}.`,
        '',
        'Nothing changes until then. After that WagonWise is a paid service, and we will need to agree payment with you to keep your account running without a break.',
        ...planLine(input.dashboardUrl),
        ...contactLine(),
        '',
        'If you decide not to carry on, just tell us.',
        ...sign,
      ].join('\n'),
    };
  }

  const pauseOn = pauseDay(input);
  if (input.kind === 'overdue' || input.kind === 'overdue_week') {
    const again = input.kind === 'overdue_week';
    const pause =
      pauseOn === null
        ? 'If it stays unpaid the account may be paused.'
        : `If it is not sorted out by ${longDay(pauseOn)}, the account will be paused.`;
    return {
      subject: again
        ? `Reminder: payment for ${company} on WagonWise is still overdue`
        : `Payment for ${company} on WagonWise is overdue`,
      text: [
        hello,
        '',
        again
          ? `This is a reminder that payment for ${company} on WagonWise is still overdue.`
          : `Payment for ${company} on WagonWise is now overdue.`,
        '',
        `Nothing has been switched off. ${pause}`,
        '',
        'A paused account can still be signed in to and every record read, but nothing can be changed, and your drivers will no longer see your jobs. Nothing is deleted.',
        ...planLine(input.dashboardUrl),
        ...contactLine(),
        ...sign,
      ].join('\n'),
    };
  }

  return {
    subject: `The WagonWise account for ${company} has been paused`,
    text: [
      hello,
      '',
      `The WagonWise account for ${company} has been paused because payment is outstanding.`,
      '',
      'What this means:',
      '- You and your colleagues can still sign in and read every page.',
      '- Nothing can be changed, and downloads and printing are switched off. If you need your records, tell us and we will send them to you.',
      '- Your drivers no longer see your jobs. The free app still works for them: routing, hazard warnings and SOS.',
      '- Nothing has been deleted.',
      '',
      `To start the account again, reply to this email or write to ${SUPPORT_EMAIL}.`,
      ...planLine(input.dashboardUrl),
      ...sign,
    ].join('\n'),
  };
}
