/** A driver card download built by hand, for tests: an identification record, and optionally a driver activity record, in a download's
 *  own layout. Invented people only. */
const pad = (text: string, length: number): number[] => {
  const bytes = [...text].map((c) => c.charCodeAt(0));
  while (bytes.length < length) bytes.push(0x20);
  return bytes.slice(0, length);
};
const time = (iso: string): number[] => {
  const seconds = Date.parse(iso) / 1000;
  return [(seconds >>> 24) & 0xff, (seconds >>> 16) & 0xff, (seconds >>> 8) & 0xff, seconds & 0xff];
};

/** A day on the card: with `worked` the card was in a tachograph with driving and rest on it; without, a day of rest with it out. */
export interface ActivityDay {
  date: string;
  worked: boolean;
}

const be16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];

/** A driver activity record (tag 0504): the two pointers, then the days written one after another into a buffer with spare room. */
function activityRecord(days: readonly ActivityDay[]): number[] {
  const buffer: number[] = [];
  let previousLength = 0;
  let newest = 0;
  for (const day of days) {
    // Not in a tachograph (bit 13) with rest, or in one with driving from 01:00 then rest from 10:00.
    const changes = day.worked ? [(3 << 11) | 60, 600] : [0x2000];
    const length = 12 + 2 * changes.length;
    newest = buffer.length;
    buffer.push(
      ...be16(previousLength),
      ...be16(length),
      ...time(`${day.date}T00:00:00Z`),
      0x00,
      0x01,
      0x00,
      0x00,
    );
    for (const change of changes) buffer.push(...be16(change));
    previousLength = length;
  }
  const data = [...be16(0), ...be16(newest), ...buffer, ...new Array<number>(40).fill(0)];
  return [0x05, 0x04, 0x00, ...be16(data.length), ...data];
}

export function cardFile(card: {
  cardNumber: string;
  surname: string;
  firstNames: string;
  expiresAt: string;
  /** The days on the card, oldest first. Without them the file has no activity. */
  days?: readonly ActivityDay[];
}): Buffer {
  const identification = [
    0x01, // issuing state
    ...pad(card.cardNumber, 16),
    0x01,
    ...pad('Test Authority', 35),
    ...time('2021-03-01T00:00:00Z'),
    ...time('2021-03-01T00:00:00Z'),
    ...time(card.expiresAt),
    0x01,
    ...pad(card.surname, 35),
    0x01,
    ...pad(card.firstNames, 35),
    0x19,
    0x90,
    0x01,
    0x01, // birth date
    0x65,
    0x6e, // language
  ];
  const length = identification.length;
  return Buffer.from([
    0x05,
    0x20,
    0x00,
    length >> 8,
    length & 0xff,
    ...identification,
    ...(card.days === undefined ? [] : activityRecord(card.days)),
  ]);
}
