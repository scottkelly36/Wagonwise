export type YesNoAnswer = 'yes' | 'no' | 'unclear';

// A short, hard-coded word list rather than a second LLM round trip — the confirm step (design
// doc §7 step 4) only ever needs a yes/no distinction, and a driver answering "yes"/"save it"/"no"
// is the whole of what this needs to catch. Substring match, not exact match, since the phone
// hears a full utterance ("yeah, save that") not a bare word.
const YES_WORDS = [
  'yes',
  'yeah',
  'yep',
  'yup',
  'correct',
  'aye',
  'confirm',
  'save it',
  "that's right",
];
const NO_WORDS = ['no', 'nope', 'nah', 'cancel', 'wrong', 'discard', "don't save"];

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Word-boundary matching, not a plain substring check — "I know where that is" must never match
// "no" just because "know" happens to contain it as a substring.
function matchesAny(normalized: string, words: readonly string[]): boolean {
  return words.some((word) => new RegExp(`\\b${escapeRegExp(word)}\\b`).test(normalized));
}

/**
 * Turns a driver's spoken reply to "save it?" into yes/no/unclear (design doc §7 step 4). `no`
 * and `unclear` are handled identically by the caller — both mean "don't file this without a
 * proper look" — but are kept distinct here since they're genuinely different signals (an
 * explicit no vs. a misheard or off-topic reply).
 */
export function parseYesNo(transcript: string): YesNoAnswer {
  const normalized = transcript.toLowerCase();
  if (matchesAny(normalized, YES_WORDS)) return 'yes';
  if (matchesAny(normalized, NO_WORDS)) return 'no';
  return 'unclear';
}
