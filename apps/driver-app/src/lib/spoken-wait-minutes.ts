/** The same choices `report-congestion.tsx` offers as chips, so a voice report and a tap report
 *  land on the same handful of values. */
export const WAIT_MINUTES_PRESETS = [5, 15, 30, 60] as const;
export type WaitMinutesPreset = (typeof WAIT_MINUTES_PRESETS)[number];

/** Used when the reply has no number the parser can find ("not sure", "dunno", a mishearing) —
 *  the middle of the range, so a vague report is neither alarming nor dismissive. */
export const DEFAULT_WAIT_MINUTES: WaitMinutesPreset = 15;

const UNITS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** "twenty five" / "twenty-five" / "25" / "a" → a number; `undefined` if the words aren't one. */
function wordsToNumber(words: string): number | undefined {
  const trimmed = words.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(/[\s-]+/).filter((p) => p !== 'and');
  if (parts.length === 0) return undefined;
  let total = 0;
  for (const part of parts) {
    if (TENS[part] !== undefined) total += TENS[part];
    else if (UNITS[part] !== undefined) total += UNITS[part];
    else return undefined;
  }
  return total;
}

const NUMBER = String.raw`(\d+(?:\.\d+)?|(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?)|(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen))`;

/**
 * A driver's spoken answer to "How long's the wait?" as minutes, or `undefined` if there's no
 * number in it. Pure and on-device — no server round trip for something this small. Handles what
 * speech recognition actually returns: digits ("20 minutes"), words ("twenty five minutes"),
 * hours ("an hour", "2 hours", "hour and a half", "half an hour"), and a bare number ("about
 * 10"), which is read as minutes.
 */
export function parseSpokenWaitMinutes(transcript: string): number | undefined {
  const text = transcript.toLowerCase().replace(/[^a-z0-9.\s-]/g, ' ');

  if (/\bhalf an? hour\b/.test(text)) return 30;
  if (/\bquarter of an hour\b/.test(text)) return 15;
  if (/\b(an|one) hour and a half\b|\bhour and a half\b|\bone and a half hours?\b/.test(text)) {
    return 90;
  }

  const hours = new RegExp(String.raw`\b${NUMBER}\s+hours?\b`).exec(text);
  if (hours?.[1] !== undefined) {
    const n = wordsToNumber(hours[1]);
    if (n !== undefined) return n * 60;
  }
  if (/\bhour\b/.test(text) && !/\bminutes?\b|\bmins?\b/.test(text)) return 60;

  const minutes = new RegExp(String.raw`\b${NUMBER}\s*(?:minutes?|mins?)\b`).exec(text);
  if (minutes?.[1] !== undefined) {
    const n = wordsToNumber(minutes[1]);
    if (n !== undefined) return n;
  }

  // A bare number with no unit ("about ten", "20") — minutes is the only sensible reading. "a"/
  // "an" alone aren't numbers without a unit after them.
  const bare = new RegExp(String.raw`\b${NUMBER}\b`).exec(text);
  if (bare?.[1] !== undefined && bare[1] !== 'a' && bare[1] !== 'an') {
    return wordsToNumber(bare[1]);
  }
  return undefined;
}

/** The nearest preset to `minutes` (ties go to the longer wait — the more cautious report), or
 *  `DEFAULT_WAIT_MINUTES` when nothing was understood. */
export function toWaitPreset(minutes: number | undefined): WaitMinutesPreset {
  if (minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_WAIT_MINUTES;
  }
  let best: WaitMinutesPreset = WAIT_MINUTES_PRESETS[0];
  for (const preset of WAIT_MINUTES_PRESETS) {
    if (Math.abs(preset - minutes) <= Math.abs(best - minutes)) best = preset;
  }
  return best;
}
