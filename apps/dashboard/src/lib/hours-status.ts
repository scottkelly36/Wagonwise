import type { HoursStatusDto } from '@wagonwise/contracts/hours';

const STATE: Record<HoursStatusDto['state'], string> = {
  driving: 'Driving',
  working: 'Other work',
  on_break: 'On a break',
};

/** "1h 20m", "45m", "0m". */
export function minutesText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * A driver's status as the live map shows it. It is a guide the driver enters, not a record of hours, so it says "about"
 * and names what the time is until. `ageMin` is how long since the driver's phone last sent it.
 */
export function hoursStatusText(status: HoursStatusDto, ageMin: number): string {
  const until = status.next === 'break' ? 'a break' : 'their limit';
  const age = ageMin >= 10 ? ` (updated ${ageMin} min ago)` : '';
  const left = `about ${minutesText(status.drivingLeftMin)} of driving left before ${until}`;
  return status.state === 'on_break'
    ? `${STATE[status.state]}; ${left}${age}`
    : `${STATE[status.state]}, ${left}${age}`;
}

/** Red when under half an hour is left. */
export const hoursStatusUrgent = (status: HoursStatusDto): boolean =>
  status.state !== 'on_break' && status.drivingLeftMin < 30;
