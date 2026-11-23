import type { CompanyId } from './company.js';

/**
 * Whether a company may use WagonWise (docs/company-account-states-scope.md).
 *
 * - `trial`: the free period, which ends on `trialEndsOn`.
 * - `active`: paying, or free by the owner's say-so (the pilot firm).
 * - `overdue`: past the end of the trial or behind on payment, in the grace period. Nothing is switched off yet.
 * - `paused`: not usable while payment is outstanding. Staff can still sign in and read their pages; nothing can be changed.
 *   Nothing is ever deleted by a pause.
 */
export const ACCOUNT_STATUSES = ['trial', 'active', 'overdue', 'paused'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export interface AccountState {
  readonly companyId: CompanyId;
  readonly status: AccountStatus;
  /** The UK day (`YYYY-MM-DD`) the free period ends; null once it is not on a trial. */
  readonly trialEndsOn: string | null;
  readonly overdueSince: Date | null;
  readonly pausedAt: Date | null;
  /** Why, in the owner's words. For WagonWise staff only. */
  readonly note: string;
  /** "Never pause this company": the automatic rules skip it. */
  readonly hold: boolean;
}

/**
 * Whether the automatic rules run: `off` (nothing by itself), `no_pause` (emails, and a finished free period moves to overdue, but
 * nothing is paused) or `full` (an overdue company is paused when its grace period has passed). It starts off.
 */
export const ACCOUNT_AUTOMATION_MODES = ['off', 'no_pause', 'full'] as const;
export type AccountAutomation = (typeof ACCOUNT_AUTOMATION_MODES)[number];

/** Settings for every company: how long a new company's free period is, how long it is overdue before it is paused, and whether the rules run. */
export interface AccountSettings {
  readonly defaultTrialDays: number;
  readonly graceDays: number;
  readonly automation: AccountAutomation;
}

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  defaultTrialDays: 90,
  graceDays: 14,
  automation: 'off',
};
export const MAX_TRIAL_DAYS = 365;
export const MAX_GRACE_DAYS = 90;
export const MAX_NOTE_LENGTH = 500;

/** One move between states, as kept in the log. `byStaffId` is null for a move the system made. */
export interface AccountStateMove {
  readonly id: string;
  readonly companyId: CompanyId;
  readonly from: AccountStatus | null;
  readonly to: AccountStatus;
  readonly byStaffId: string | null;
  readonly note: string;
  readonly at: Date;
}

/** Only a paused company is held back; the other three states let everything through. */
export function isPaused(status: AccountStatus): boolean {
  return status === 'paused';
}

/**
 * The UK day a free period that starts on `today` (a `YYYY-MM-DD` UK day) and lasts `days` days ends on: `days` days later.
 * Plain calendar arithmetic on the day, so the clocks changing makes no difference.
 */
export function trialEndsOn(today: string, days: number): string {
  const start = new Date(`${today}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + days);
  return start.toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from one UK day to another (`YYYY-MM-DD`); negative when `to` is earlier. Plain calendar arithmetic. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS,
  );
}

/** The hour (0 to 23) of an instant in UK time. */
export function ukHour(at: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(at);
  return Number(hour);
}

/** The UK day for an instant, as `YYYY-MM-DD`. */
export function ukDay(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/**
 * Staff requests a paused company may still make, however they are sent (docs/company-account-states-scope.md). Everything else that
 * changes something is refused. Reads (`GET`, `HEAD`) are never refused by this rule.
 *
 * - removing a person: so a paused company can still take someone's access away;
 * - resolving an SOS alert: a safety alert from a driver must never be stuck because of what a firm owes;
 * - adding payment details: that is how a paused company pays its way back;
 * - answering the market research question: a person must always be able to withdraw their agreement to be contacted;
 * - signing out and signing in are not listed: those routes are public and never reach this rule.
 */
export const OPEN_WHEN_PAUSED: readonly {
  readonly method: string;
  readonly pattern: RegExp;
  /** The route as it is registered, so a test can check each entry still names a real route. */
  readonly route: string;
}[] = [
  { method: 'DELETE', pattern: /^\/staff\/members\/[^/]+$/, route: '/staff/members/:id' },
  { method: 'POST', pattern: /^\/staff\/sos\/[^/]+\/resolve$/, route: '/staff/sos/:id/resolve' },
  { method: 'POST', pattern: /^\/staff\/payments\/setup$/, route: '/staff/payments/setup' },
  { method: 'PUT', pattern: /^\/staff\/research-contact$/, route: '/staff/research-contact' },
];

export function isOpenWhenPaused(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
  return OPEN_WHEN_PAUSED.some((entry) => entry.method === m && entry.pattern.test(path));
}

/** True when a request by a company's staff must be refused: the company is paused and the request changes something. */
export function refusesStaffRequest(status: AccountStatus, method: string, path: string): boolean {
  return isPaused(status) && !isOpenWhenPaused(method, path);
}
