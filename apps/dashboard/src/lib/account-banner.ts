import type { OwnAccountStateDto } from '@wagonwise/contracts/companies';

export interface AccountBannerContent {
  readonly tone: 'warn' | 'bad' | 'info';
  readonly text: string;
}

/** How many days before the end of the free period the banner starts to say so. */
export const TRIAL_NOTICE_DAYS = 14;

const SUPPORT = 'support@wagon-wise.co.uk';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from one UK day to another (`YYYY-MM-DD`). Plain calendar arithmetic, so the clocks changing makes no difference. */
export function daysBetween(from: string, to: string): number {
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

/**
 * What a company's own staff are told above every page about their account, or nothing. Paused: what still works and who to
 * contact. Overdue: a nudge before anything is switched off. A trial: only once its end is near. `today` is the UK day.
 */
export function accountBanner(
  state: Pick<OwnAccountStateDto, 'status' | 'trialEndsOn'>,
  today: string,
): AccountBannerContent | undefined {
  if (state.status === 'paused') {
    return {
      tone: 'bad',
      text: `Your account is paused. You can still sign in and see everything, but you cannot change anything, and your drivers cannot see your jobs. To start it again, contact ${SUPPORT}.`,
    };
  }
  if (state.status === 'overdue') {
    return {
      tone: 'warn',
      text: `Payment is overdue. Please get in touch so nothing is switched off: ${SUPPORT}.`,
    };
  }
  if (state.status === 'trial' && state.trialEndsOn !== null) {
    const left = daysBetween(today, state.trialEndsOn);
    if (left < 0) {
      return {
        tone: 'warn',
        text: `Your free period ended on ${longDay(state.trialEndsOn)}. Please get in touch: ${SUPPORT}.`,
      };
    }
    if (left <= TRIAL_NOTICE_DAYS) {
      const when = left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`;
      return {
        tone: 'info',
        text: `Your free period ends ${when}, on ${longDay(state.trialEndsOn)}. Questions about what happens next? ${SUPPORT}.`,
      };
    }
  }
  return undefined;
}

/** What stands in place of a download or print button while the company is paused: the records are still there, and how to get them. */
export function exportsPausedMessage(): string {
  return `Downloads and printing are switched off while your account is paused. Email ${SUPPORT} and we will send you what you need.`;
}
