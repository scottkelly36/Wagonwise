import { durationText, type HoursStatus } from './driver-hours';

/** Under this much driving left, the clock on the navigation screen turns amber. */
export const URGENT_MS = 30 * 60_000;

export interface QuickSummary {
  /** What to say on the small clock while navigating. */
  readonly text: string;
  readonly urgent: boolean;
  readonly running: boolean;
}

const STATE_TEXT = {
  idle: 'Driving hours',
  driving: 'Driving',
  working: 'Other work',
  on_break: 'On a break',
} as const;

/**
 * The line on the small driving-hours clock on the navigation screen: what the driver is doing and the driving left, or an
 * invitation to start when no shift is on. Short, because it sits on the map.
 */
export function quickSummary(status: HoursStatus): QuickSummary {
  if (status.state === 'idle') {
    return { text: 'Driving hours · tap to start', urgent: false, running: false };
  }
  const until = status.next === 'break' ? 'break' : 'limit';
  const left = status.untilBreakMs === null ? status.untilDailyLimitMs : status.drivingLeftMs;
  const text =
    status.state === 'on_break'
      ? `${STATE_TEXT.on_break} · ${durationText(left)} to ${until} after`
      : `${STATE_TEXT[status.state]} · ${durationText(left)} to ${until}`;
  return { text, urgent: status.state !== 'on_break' && left < URGENT_MS, running: true };
}
