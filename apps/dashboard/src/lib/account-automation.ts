import type {
  AccountAutomationDto,
  AccountEmailKindDto,
  AccountHistoryDto,
  AccountRulesRunDto,
} from '@wagonwise/contracts/companies';

export const AUTOMATION_OPTIONS: readonly {
  readonly value: AccountAutomationDto;
  readonly label: string;
}[] = [
  { value: 'off', label: 'Off: nothing happens by itself' },
  {
    value: 'no_pause',
    label: 'Emails, and a finished free period becomes overdue. Nothing is ever paused',
  },
  {
    value: 'full',
    label: 'Everything: and an overdue company is paused when its grace period has passed',
  },
];

/** What the owner is asked to confirm before the rules can pause a company on their own. */
export const FULL_AUTOMATION_WARNING =
  'From now on a company that is overdue for longer than the grace period will be paused without anyone pressing anything, and its drivers will lose its jobs. You will be emailed each time. Companies with "Never pause" ticked are skipped. Switch this on?';

/** What one pass of the rules did, in a line. */
export function runSummary(done: AccountRulesRunDto): string {
  const parts: string[] = [];
  if (done.moved > 0) parts.push(`${done.moved} moved`);
  if (done.emailed > 0) parts.push(`${done.emailed} emailed`);
  if (done.nobodyToWrite > 0) parts.push(`${done.nobodyToWrite} with nobody to write to`);
  if (done.failed > 0) parts.push(`${done.failed} failed`);
  return parts.length === 0
    ? 'Nothing needed doing (or the rules are off, or it is before 7am).'
    : `${parts.join(', ')}.`;
}

const EMAIL_LABEL: Record<AccountEmailKindDto, string> = {
  trial_14: 'Free period ending (14 days)',
  trial_7: 'Free period ending (7 days)',
  overdue: 'Payment overdue',
  overdue_week: 'Payment overdue (reminder)',
  paused: 'Account paused',
  resumed: 'Account active again',
};

const dayTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });

const STATE_LABEL: Record<string, string> = {
  trial: 'free trial',
  active: 'active',
  overdue: 'overdue',
  paused: 'paused',
};

/** The history of a company's account as lines of text, newest first: moves and emails together. */
export function historyLines(history: AccountHistoryDto): { at: string; text: string }[] {
  const moves = history.moves.map((m) => ({
    at: m.at,
    text: `${dayTime(m.at)}: ${m.from === null ? 'started as' : `${STATE_LABEL[m.from] ?? m.from} to`} ${STATE_LABEL[m.to] ?? m.to}, ${m.automatic ? 'by the rules' : 'by hand'}${m.note === '' ? '' : ` (${m.note})`}`,
  }));
  const emails = history.emails.map((e) => ({
    at: e.at,
    text: `${dayTime(e.at)}: emailed "${EMAIL_LABEL[e.kind]}" to ${e.recipients} ${e.recipients === 1 ? 'person' : 'people'}`,
  }));
  return [...moves, ...emails].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
