import type {
  CheckAnswer,
  CheckItem,
  CheckResult,
  DefectStatus,
} from '@wagonwise/contracts/checks';

export type RangeChoice = 'today' | '7' | '30';

export const RANGE_LABELS: Record<RangeChoice, string> = {
  today: 'Today',
  '7': 'Last 7 days',
  '30': 'Last 30 days',
};

const addDays = (day: string, delta: number): string => {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
};

/** The UK days a choice covers, ending today (both included). */
export function rangeFor(choice: RangeChoice, today: string): { from: string; to: string } {
  const days = choice === 'today' ? 1 : Number(choice);
  return { from: addDays(today, -(days - 1)), to: today };
}

export const RESULT_LABELS: Record<CheckResult, string> = {
  clear: 'Clear',
  advisory: 'Fix soon',
  do_not_drive: 'Do not drive',
};

export const STATUS_LABELS: Record<DefectStatus, string> = {
  open: 'Open',
  acknowledged: 'Seen',
  fixed: 'Fixed',
};

/** What a driver answered, in words. `—` for a question left alone. */
export function answerText(item: CheckItem, answer: CheckAnswer | undefined): string {
  if (answer === undefined) return '—';
  switch (item.kind) {
    case 'pass_fail':
      return answer.value === 'defect' ? 'Defect' : 'OK';
    case 'yes_no':
      return answer.value === 'yes' ? 'Yes' : 'No';
    case 'number':
      return item.unit === undefined ? String(answer.value) : `${answer.value} ${item.unit}`;
    case 'photo':
      return 'Photo';
    case 'note':
      return String(answer.value);
  }
}

/** A date and time in UK style, in UK time. */
export function whenText(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}
