/**
 * What a driver card download says about the card's activity: the first and last day it holds records for, and on how many of those
 * days the holder had the card in a tachograph and was driving, working or available. Nothing else is read out of the activity: not the
 * times, the distances or the minutes.
 *
 * It is best effort, and it never judges a file: one that does not read gives `undefined` and is kept all the same. The walk checks
 * the records against each other as it goes and gives nothing, never a shorter period, if anything does not add up.
 *
 * Where the layout comes from (facts only; none of the code of these is used):
 * - the driver activity file is tag `0504`. It starts with two bytes for where the oldest day's record starts and two for where the
 *   newest starts (counted from the end of those four bytes), then a cyclic buffer, the rest of the file, that the records are written
 *   into and wrap round the end of (open-source parsers traconiq/tachoparser and way-platform/tachograph-go, EU Regulation 2016/799
 *   Annex 1C appendix 1 2.9 and 2.17);
 * - a day's record is: 2 bytes for the length of the record before it, 2 for its own length, 4 for the day (seconds since 1 January
 *   1970, big endian, midnight UTC), 2 for the day's presence counter, 2 for the distance, then 2 bytes for each change of activity.
 *   The records are walked from the newest back, each pointing at the one before by its previous length;
 * - a change of activity is 16 bits, `s c p aa ttttttttttt`: `s` the driver slot (0) or the co-driver's, `c` single or crew, `p` 0 when
 *   the card is in a tachograph and 1 when it is not, `aa` break or rest (0), availability (1), work (2) or driving (3), and `t` the
 *   minute of the day. The record length of a day with just a rest before midnight is 14 bytes: the card was not used.
 *   These were checked against way-platform/tachograph-go's test records, which are real card data made anonymous: 189 days from
 *   1 January to 7 July 2020, 106 of them such days of rest, 83 days with the card in use.
 *
 * Only the first generation file has been checked against data. The second generation file (appendix `02`) has the same layout in both
 * parsers, and is read only when a file has no first generation copy (a second generation card's download holds both).
 */

import { FIRST_GENERATION_DATA, records, SECOND_GENERATION_DATA } from './card-file-records.js';

export interface CardActivity {
  /** The first day the card holds a record for, `YYYY-MM-DD` (a UTC day). */
  readonly from: string;
  /** The last day the card holds a record for, `YYYY-MM-DD`. */
  readonly to: string;
  /** Days in that period on which the card was in a tachograph and driving, work or availability was recorded on it. */
  readonly workDays: number;
}

const DRIVER_ACTIVITY_FILE = 0x0504;
const POINTERS_LENGTH = 4;
const HEADER_LENGTH = 12;
const CHANGE_LENGTH = 2;
/** A day has at most one change a minute. */
const MOST_CHANGES = 1440;
const EARLIEST_DAY = Date.UTC(2000, 0, 1) / 1000;
const LATEST_DAY = Date.UTC(2100, 0, 1) / 1000;
const NOT_IN_TACHOGRAPH = 0x2000;
const ACTIVITY_MASK = 0x1800;
const BREAK_OR_REST = 0;
const MINUTE_MASK = 0x07ff;

function walk(data: Uint8Array): CardActivity | undefined {
  const size = data.length - POINTERS_LENGTH;
  if (size < HEADER_LENGTH) return undefined;
  const oldest = ((data[0] as number) << 8) | (data[1] as number);
  const newest = ((data[2] as number) << 8) | (data[3] as number);
  if (oldest >= size || newest >= size) return undefined;
  const byte = (at: number): number => data[POINTERS_LENGTH + (at % size)] as number;
  const word = (at: number): number => (byte(at) << 8) | byte(at + 1);

  let at = newest;
  let newerDay = Infinity;
  /** What the record just after this one says the length of this one is: they must agree. */
  let expectedLength: number | undefined;
  let total = 0;
  let days = 0;
  let workDays = 0;
  let firstDay = 0;
  let lastDay = 0;
  for (let step = 0; step <= Math.ceil(size / (HEADER_LENGTH + CHANGE_LENGTH)); step++) {
    const previousLength = word(at);
    const length = word(at + 2);
    if (length < HEADER_LENGTH || (length - HEADER_LENGTH) % CHANGE_LENGTH !== 0) return undefined;
    if ((length - HEADER_LENGTH) / CHANGE_LENGTH > MOST_CHANGES) return undefined;
    if (expectedLength !== undefined && length !== expectedLength) return undefined;
    total += length;
    if (total > size) return undefined;

    const day =
      ((byte(at + 4) << 24) >>> 0) + (byte(at + 5) << 16) + (byte(at + 6) << 8) + byte(at + 7);
    if (day < EARLIEST_DAY || day >= LATEST_DAY || day >= newerDay) return undefined;

    let worked = false;
    for (let change = HEADER_LENGTH; change < length; change += CHANGE_LENGTH) {
      const value = word(at + change);
      if ((value & MINUTE_MASK) >= MOST_CHANGES) return undefined;
      if ((value & NOT_IN_TACHOGRAPH) === 0 && (value & ACTIVITY_MASK) !== BREAK_OR_REST)
        worked = true;
    }
    if (worked) workDays++;
    days++;
    if (days === 1) lastDay = day;
    firstDay = day;

    if (at === oldest) {
      const iso = (seconds: number): string => new Date(seconds * 1000).toISOString().slice(0, 10);
      return { from: iso(firstDay), to: iso(lastDay), workDays };
    }
    // The oldest record's own "previous length" is left over from what was there before, so it is never used.
    if (previousLength < HEADER_LENGTH) return undefined;
    expectedLength = previousLength;
    newerDay = day;
    at = (at - previousLength + size) % size;
    if (previousLength > size) return undefined;
  }
  return undefined;
}

/**
 * The period a driver card download holds activity for, and the days worked in it, or `undefined` when the file does not read as one
 * (or has no activity on it).
 */
export function readCardActivity(bytes: Uint8Array): CardActivity | undefined {
  try {
    const all = records(bytes).filter((r) => r.file === DRIVER_ACTIVITY_FILE);
    for (const appendix of [FIRST_GENERATION_DATA, SECOND_GENERATION_DATA]) {
      const record = all.find((r) => r.appendix === appendix);
      if (record === undefined) continue;
      const activity = walk(record.data);
      if (activity !== undefined) return activity;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
