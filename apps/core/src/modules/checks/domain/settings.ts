export const MIN_RETENTION_MONTHS = 1;
export const MAX_RETENTION_MONTHS = 120;
export const DEFAULT_RETENTION_MONTHS = 12;

/** A firm's own rules about sending a vehicle out, and how long it keeps its records. */
export interface CheckSettings {
  /** A driver cannot accept a job on a vehicle until its check lists for the day are done. */
  readonly requiredBeforeJob: boolean;
  /** A vehicle with a "do not drive" defect not yet marked fixed is not sent out. */
  readonly blockOnDoNotDrive: boolean;
  /** How many months a check is kept. The firm chooses, as it is the controller of the records. */
  readonly retentionMonths: number;
}

export const DEFAULT_SETTINGS: CheckSettings = {
  requiredBeforeJob: false,
  blockOnDoNotDrive: false,
  retentionMonths: DEFAULT_RETENTION_MONTHS,
};

export function isValidRetention(months: number): boolean {
  return (
    Number.isInteger(months) && months >= MIN_RETENTION_MONTHS && months <= MAX_RETENTION_MONTHS
  );
}

/** `months` calendar months before `now` (UTC). */
export function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now.getTime());
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/** What the checks say about a driver taking this vehicle on a job. */
export type StartVerdict = 'ok' | 'check_required' | 'vehicle_not_fit';

/**
 * The firm's rules applied to the vehicle as it stands. A vehicle with a "do not drive" defect still open comes
 * first, when the firm holds those back, since doing today's check does not make it safe. Otherwise, when the firm
 * wants the check done first, any list for the vehicle not yet done today holds the job back. A vehicle with no
 * lists has nothing to do, so a firm that turned the rule on before building a list is not locked out.
 */
export function startVerdict(input: {
  readonly settings: CheckSettings;
  /** Lists that apply to this vehicle and have not been done on it today. */
  readonly listsStillToDo: number;
  /** A "do not drive" defect on this vehicle is open or seen, but not fixed. */
  readonly hasUnfixedDoNotDrive: boolean;
}): StartVerdict {
  const { settings } = input;
  if (settings.blockOnDoNotDrive && input.hasUnfixedDoNotDrive) return 'vehicle_not_fit';
  if (settings.requiredBeforeJob && input.listsStillToDo > 0) return 'check_required';
  return 'ok';
}
