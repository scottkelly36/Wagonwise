import type { OwnAccountStateDto } from '@wagonwise/contracts/companies';
import { formatPence } from './money';

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

export interface AccountStanding {
  readonly tone: 'ok' | 'info' | 'warn' | 'bad';
  /** One line: where the account stands. */
  readonly headline: string;
  /** What follows from it, or nothing to add. */
  readonly detail: string | undefined;
}

/**
 * Where the account stands, for the firm's own billing page (the banner above says nothing for an active account and for a trial
 * that is far from ending, but a page about billing should always say). `today` is the UK day.
 */
export function accountStanding(
  state: Pick<OwnAccountStateDto, 'status' | 'trialEndsOn'>,
  today: string,
): AccountStanding {
  if (state.status === 'paused') {
    return {
      tone: 'bad',
      headline: 'Your account is paused.',
      detail: `You can still sign in and see everything, but you cannot change anything, and your drivers cannot see your jobs. To start it again, contact ${SUPPORT}.`,
    };
  }
  if (state.status === 'overdue') {
    return {
      tone: 'warn',
      headline: 'Payment is overdue.',
      detail: `Nothing has been switched off. Please get in touch so it stays that way: ${SUPPORT}.`,
    };
  }
  if (state.status === 'trial' && state.trialEndsOn !== null) {
    const left = daysBetween(today, state.trialEndsOn);
    if (left < 0) {
      return {
        tone: 'warn',
        headline: `Your free period ended on ${longDay(state.trialEndsOn)}.`,
        detail: `Please get in touch about what happens next: ${SUPPORT}.`,
      };
    }
    const when = left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`;
    return {
      tone: 'info',
      headline: `Your free period ends ${when}, on ${longDay(state.trialEndsOn)}.`,
      detail: undefined,
    };
  }
  if (state.status === 'trial') {
    return { tone: 'info', headline: 'You are on a free trial.', detail: undefined };
  }
  return { tone: 'ok', headline: 'Your account is active.', detail: undefined };
}

/**
 * What the Plan page says about the plan to a company still in its free period: that nothing is charged yet, and what it costs when
 * the period ends (a price for each vehicle it uses, not for the room on its plan). `undefined` for any other state, where the page states the monthly amount as it is.
 */
export function trialPlanText(
  state: Pick<OwnAccountStateDto, 'status' | 'trialEndsOn'>,
  plan: { readonly capacityToday: number; readonly pricePerVehiclePence: number },
): { readonly headline: string; readonly afterwards: string } | undefined {
  if (state.status !== 'trial') return undefined;
  const vehicles = `${plan.capacityToday} vehicle${plan.capacityToday === 1 ? '' : 's'}`;
  const ends = state.trialEndsOn === null ? '' : ` (it ends on ${longDay(state.trialEndsOn)})`;
  const price = `${formatPence(plan.pricePerVehiclePence)} a month`;
  return {
    headline: `Room for ${vehicles}. Free during your free period.`,
    afterwards: `After your free period${ends} you pay ${price} for each vehicle you use: one given a job or checked in a month. A vehicle that sits idle costs nothing.`,
  };
}

/** What the company owes now: its issued invoices that are not paid. A draft or a cancelled invoice is not owed. */
export function amountDue(invoices: readonly { status: string; totalPence: number }[]): {
  readonly pence: number;
  readonly count: number;
} {
  const due = invoices.filter((i) => i.status === 'issued');
  return { pence: due.reduce((sum, i) => sum + i.totalPence, 0), count: due.length };
}

/** What stands in place of a download or print button while the company is paused: the records are still there, and how to get them. */
export function exportsPausedMessage(): string {
  return `Downloads and printing are switched off while your account is paused. Email ${SUPPORT} and we will send you what you need.`;
}
