/**
 * What a driver card download says about the card and its holder: the card's number, the holder's name, when the card runs out, and
 * which generations of the card are in the file. Nothing else is read out of the file.
 *
 * It is best effort, and it never judges a file: a download that does not read (a different layout, a damaged copy, a file that is
 * not a driver card download) gives `undefined`, and the file is kept all the same. Every field is checked as sane before it is
 * returned, so a wrong guess about a layout gives nothing rather than a wrong name on someone's record.
 *
 * Where the layout comes from (facts only; none of the code of these is used):
 * - the file is a run of records: a three byte tag (the card file's identifier, then `00` for the data of a first generation card, `02`
 *   for a second generation one), two bytes of length (big endian), then the bytes (open-source parser traconiq/tachoparser, which
 *   reads real files, and the driver app's own writer);
 * - the identification file is tag `0520`, 143 bytes: the card's identification (1 byte issuing state, 16 byte card number, 36 byte
 *   issuing authority, then issue date, start of validity and expiry as 4 byte times) and the holder's (36 byte surname, 36 byte first
 *   names, 4 byte birth date, 2 byte language). A name is a code page byte then 35 characters padded with spaces. A time is the
 *   seconds since 1 January 1970, big endian (EU Regulation 2016/799 Annex 1C appendix 1, and, with real card data made anonymous,
 *   way-platform/tachograph-go's test records, which these offsets were checked against).
 * The birth date and the issuing authority are not kept.
 */

export interface CardIdentity {
  /** The 16 character card number. */
  readonly cardNumber: string;
  /** The holder's name as printed on the card: first names then surname. */
  readonly holderName: string;
  /** The day the card runs out, `YYYY-MM-DD`. */
  readonly expiresOn: string;
  /** Which generations of the card the file holds: `1`, `2` or `1,2`. */
  readonly generations: string;
}

const IDENTIFICATION_FILE = 0x0520;
const FIRST_GENERATION_DATA = 0x00;
const SECOND_GENERATION_DATA = 0x02;
const IDENTIFICATION_LENGTH = 143;
const NAME_LENGTH = 36;
const CARD_NUMBER_AT = 1;
const CARD_NUMBER_LENGTH = 16;
const EXPIRY_AT = 1 + 16 + 36 + 4 + 4;
const SURNAME_AT = 65;
const FIRST_NAMES_AT = SURNAME_AT + NAME_LENGTH;
/** A card whose date is outside this is not read: 2000 is before cards of this kind, 2100 is a corrupt date. */
const EARLIEST_EXPIRY = Date.UTC(2000, 0, 1) / 1000;
const LATEST_EXPIRY = Date.UTC(2100, 0, 1) / 1000;

interface FileRecord {
  readonly file: number;
  readonly appendix: number;
  readonly data: Uint8Array;
}

/** The records of a download, up to the first one that does not fit (a truncated copy still gives what came before). */
function records(bytes: Uint8Array): FileRecord[] {
  const found: FileRecord[] = [];
  let at = 0;
  while (at + 5 <= bytes.length) {
    const file = ((bytes[at] as number) << 8) | (bytes[at + 1] as number);
    const appendix = bytes[at + 2] as number;
    const length = ((bytes[at + 3] as number) << 8) | (bytes[at + 4] as number);
    if (at + 5 + length > bytes.length) break;
    found.push({ file, appendix, data: bytes.subarray(at + 5, at + 5 + length) });
    at += 5 + length;
  }
  return found;
}

/** A name field: a code page byte and 35 characters. Only the Western European page (1, ISO 8859-1) is read; another gives
 *  `undefined` rather than a name with the wrong letters. */
function readName(field: Uint8Array): string | undefined {
  if (field[0] !== 1) return undefined;
  let text = '';
  for (let i = 1; i < field.length; i++) text += String.fromCharCode(field[i] as number);
  let end = text.length;
  while (end > 0 && (text[end - 1] === ' ' || text.charCodeAt(end - 1) === 0)) end--;
  const trimmed = text.slice(0, end);
  // eslint-disable-next-line no-control-regex -- control characters mean the bytes are not a name
  if (trimmed === '' || /[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) return undefined;
  return trimmed;
}

function readCardNumber(field: Uint8Array): string | undefined {
  let text = '';
  for (const byte of field) text += String.fromCharCode(byte);
  // Letters, digits and spaces: what a card number is made of.
  return /^[0-9A-Za-z ]{16}$/.test(text) && /[0-9A-Za-z]/.test(text.trim())
    ? text.trimEnd()
    : undefined;
}

function readIdentification(data: Uint8Array): Omit<CardIdentity, 'generations'> | undefined {
  if (data.length !== IDENTIFICATION_LENGTH) return undefined;
  const cardNumber = readCardNumber(
    data.subarray(CARD_NUMBER_AT, CARD_NUMBER_AT + CARD_NUMBER_LENGTH),
  );
  const surname = readName(data.subarray(SURNAME_AT, SURNAME_AT + NAME_LENGTH));
  const firstNames = readName(data.subarray(FIRST_NAMES_AT, FIRST_NAMES_AT + NAME_LENGTH));
  const seconds =
    (((data[EXPIRY_AT] as number) << 24) >>> 0) +
    ((data[EXPIRY_AT + 1] as number) << 16) +
    ((data[EXPIRY_AT + 2] as number) << 8) +
    (data[EXPIRY_AT + 3] as number);
  if (cardNumber === undefined || surname === undefined) return undefined;
  if (seconds < EARLIEST_EXPIRY || seconds >= LATEST_EXPIRY) return undefined;
  return {
    cardNumber,
    holderName: firstNames === undefined ? surname : `${firstNames} ${surname}`,
    expiresOn: new Date(seconds * 1000).toISOString().slice(0, 10),
  };
}

/**
 * The card and its holder from a driver card download, or `undefined` when the file does not read as one. A download from a second
 * generation card holds both copies; the second generation one is preferred, and the first used when it is the only one.
 */
export function readCardIdentity(bytes: Uint8Array): CardIdentity | undefined {
  try {
    const all = records(bytes).filter((r) => r.file === IDENTIFICATION_FILE);
    const first = all.find((r) => r.appendix === FIRST_GENERATION_DATA);
    const second = all.find((r) => r.appendix === SECOND_GENERATION_DATA);
    const chosen = second ?? first;
    if (chosen === undefined) return undefined;
    const identity = readIdentification(chosen.data);
    if (identity === undefined) return undefined;
    const generations =
      first !== undefined && second !== undefined ? '1,2' : second !== undefined ? '2' : '1';
    return { ...identity, generations };
  } catch {
    return undefined;
  }
}
