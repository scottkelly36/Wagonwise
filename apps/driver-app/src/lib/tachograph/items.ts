/**
 * The tachograph items the driving-hours clock needs, named as in Appendix 13 of Regulation (EU) 2021/1228 (section 4, "List of
 * data available through the ITS interface") and ISO 16844-7 (the parameters).
 *
 * PROVISIONAL: the regulation names these items and says they are in ISO 16844-7 formats and read with the Appendix 7 and 8
 * services, but the data identifiers (two bytes each) and the exact encodings are in documents we do not have yet (ISO 16844-7 is
 * a draft standard; the V2 Appendix 8 is not in the published sources we found). So:
 *
 *   - the identifiers are NOT here: they are supplied (\`ItemDids\`) once known, and an item without one is simply not read;
 *   - the decoders below follow the common tachograph (FMS TCO1) conventions: a working state in a few bits, times as whole
 *     minutes in two bytes, 0xFFFF for "not available". They must be checked against ISO 16844-7 and a real unit.
 */

export type ItemName =
  | 'workingState' // Driver1WorkingState (mandatory, personal)
  | 'continuousDrivingTime' // Driver1ContinuousDrivingTime (mandatory, personal)
  | 'cumulativeBreakTime' // Driver1CumulativeBreakTime (mandatory, personal)
  | 'currentActivityDuration' // Driver1CurrentDurationOfSelectedActivity (mandatory, personal)
  | 'previousAndCurrentWeekDrivingTime' // Driver1CumulatedDrivingTimePreviousAndCurrentWeek (mandatory, personal)
  | 'currentDailyDrivingTime' // Driver1CurrentDailyDrivingTime (optional, personal)
  | 'currentWeeklyDrivingTime'; // Driver1CurrentWeeklyDrivingTime (optional, personal)

export const ITEM_NAMES: readonly ItemName[] = [
  'workingState',
  'continuousDrivingTime',
  'cumulativeBreakTime',
  'currentActivityDuration',
  'previousAndCurrentWeekDrivingTime',
  'currentDailyDrivingTime',
  'currentWeeklyDrivingTime',
];

/** The two-byte data identifier of each item, where known. */
export type ItemDids = Partial<Record<ItemName, number>>;

/** What the driver is doing, as the tachograph records it. */
export type WorkingState = 'rest' | 'available' | 'work' | 'drive';

/** Provisional codes (see above). 6 is an error and 7 is "not available" in the same convention. */
const WORKING_STATE_CODES: Record<number, WorkingState> = {
  0: 'rest',
  1: 'available',
  2: 'work',
  3: 'drive',
};

const NOT_AVAILABLE_MINUTES = 0xffff;
/** In the same convention 0xFE00 to 0xFFFE mean an error, so are not a time. */
const FIRST_ERROR_MINUTES = 0xfe00;

export type ItemValue = WorkingState | number;

/** Reads one item. \`undefined\` when the unit says it has no value (not available or an error), never a guess. */
export function decodeItem(name: ItemName, data: Uint8Array): ItemValue | undefined {
  if (name === 'workingState') {
    if (data.length < 1) return undefined;
    return WORKING_STATE_CODES[(data[0] as number) & 0x07];
  }
  if (data.length < 2) return undefined;
  const minutes = ((data[0] as number) << 8) | (data[1] as number);
  return minutes >= FIRST_ERROR_MINUTES ? undefined : minutes;
}

/** The inverse of {@link decodeItem}, for the simulator and for tests. A missing value is encoded as "not available". */
export function encodeItem(name: ItemName, value: ItemValue | undefined): Uint8Array {
  if (name === 'workingState') {
    const code = Object.entries(WORKING_STATE_CODES).find(([, state]) => state === value)?.[0];
    return Uint8Array.of(code === undefined ? 7 : Number(code));
  }
  const minutes = typeof value === 'number' ? value : NOT_AVAILABLE_MINUTES;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > NOT_AVAILABLE_MINUTES) {
    throw new Error(`${name} must be whole minutes from 0 to ${NOT_AVAILABLE_MINUTES}`);
  }
  return Uint8Array.of(minutes >> 8, minutes & 0xff);
}
