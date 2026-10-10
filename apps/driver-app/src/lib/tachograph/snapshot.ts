import type { ItemName, WorkingState } from './items';

/**
 * Whether the driver has allowed their driving-hours data to leave the tachograph. The unit records the consent when a driver card
 * it does not know is first inserted (Appendix 13, ITS_23), and refuses to give personal data without it. \`unknown\` is a refusal
 * for some other reason, or no reading yet.
 */
export type Consent = 'given' | 'withheld' | 'unknown';

/** What one round of reading the tachograph found, at the phone's time \`at\` (ms since the epoch). Times are whole minutes. */
export interface TachographSnapshot {
  readonly at: number;
  readonly consent: Consent;
  readonly workingState?: WorkingState | undefined;
  /** Driving since the last break that counts (the 4.5 hour counter). */
  readonly continuousDrivingMin?: number | undefined;
  /** Break time accumulated towards the next qualifying break. */
  readonly cumulativeBreakMin?: number | undefined;
  /** How long the current activity has lasted. */
  readonly currentActivityMin?: number | undefined;
  readonly dailyDrivingMin?: number | undefined;
  readonly weeklyDrivingMin?: number | undefined;
  /** Driving in the previous week and this week together. */
  readonly previousAndCurrentWeekDrivingMin?: number | undefined;
  /** Items the unit refused, by its reason code (ISO 14229-1), for diagnosis. */
  readonly refused?: Partial<Record<ItemName, number>> | undefined;
}
