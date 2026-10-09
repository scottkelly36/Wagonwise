import type { ReportHoursStatusRequest } from '@wagonwise/contracts/hours';

import { hoursStatus, type Activity, type HoursOptions } from './driver-hours';
import { currentActivity } from './shift-log';

/** The version of the consent wording below. Bump it whenever the wording changes. */
export const WORDING_VERSION = 1;

/** What the driver is shown before they agree to share with a company. */
export function consentText(companyName: string): { title: string; body: string } {
  return {
    title: `Share your driving status with ${companyName}?`,
    body:
      `If you say yes, ${companyName} will see on their live map whether you are driving, on a break or on other ` +
      'work, and roughly how much driving time you have left, while you are on one of their jobs. They will not see ' +
      'what you tapped earlier, your weekly totals, or anything when you are not on a job.\n\n' +
      'This is your choice. The app works exactly the same if you say no, and you can switch it off at any time, ' +
      'which stops it straight away.\n\n' +
      'This is a guide that you enter yourself. Your tachograph is the legal record, and you are still responsible ' +
      'for staying within the rules.',
  };
}

/**
 * What to send the company right now, or `null` when the driver is not on a shift or is resting (a driver who is not working
 * shares nothing). Whole minutes, rounded down.
 */
export function statusToShare(
  log: readonly Activity[],
  options: HoursOptions,
  now: number,
): ReportHoursStatusRequest | null {
  const open = currentActivity(log);
  if (open === undefined || open.kind === 'rest') return null;
  const status = hoursStatus(log, now, options);
  return {
    state: open.kind === 'driving' ? 'driving' : open.kind === 'break' ? 'on_break' : 'working',
    drivingLeftMin: Math.max(0, Math.min(24 * 60, Math.floor(status.drivingLeftMs / 60_000))),
    next: status.next,
  };
}
