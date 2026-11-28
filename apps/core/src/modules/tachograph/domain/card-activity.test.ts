import { describe, expect, it } from 'vitest';
import { readCardActivity } from './card-activity.js';

/**
 * The first four daily records (1 to 4 January 2020: 148, 166, 14 and 14 bytes) of the driver activity file in
 * way-platform/tachograph-go's anonymised test records (MIT licence, real card data made anonymous). The first two days have the card
 * in use; the other two are days of rest with the card not in a tachograph. `card-activity.ts` was also run over the whole 13.7 KB file
 * (189 days, 1 January to 7 July 2020, 83 of them with the card in use), including copies turned round the cyclic buffer so that a
 * record crosses the end of it.
 */
const SAMPLE_HEX =
  '00 00 00 94 5e 0b e1 00 06 00 00 45 60 00 10 1e 18 3c 00 5a 18 78 00 96 18 b4 00 d2 18 f0 01 0e ' +
  '19 2c 01 4a 19 68 01 86 11 a4 19 c2 01 e0 19 fe 02 1c 1a 3a 02 58 1a 76 02 94 12 b2 1a d0 02 ee ' +
  '1b 0c 03 2a 1b 48 03 66 1b 84 03 a2 1b c0 03 de 1b fc 04 1a 1c 38 04 56 1c 74 04 92 1c b0 04 ce ' +
  '1c ec 05 0a 1d 28 05 46 1d 64 05 82 18 00 00 1e 18 3c 00 5a 18 78 00 96 10 b4 18 d2 00 f0 19 0e ' +
  '11 2c 19 4a 01 68 19 86 11 a4 19 c2 01 e0 19 fe 12 1c 62 3a 00 94 00 a6 5e 0d 32 80 06 01 00 46 ' +
  '60 00 00 1e 18 3c 10 5a 18 78 00 96 18 b4 00 d2 18 f0 11 0e 19 2c 01 4a 11 68 19 86 11 a4 19 c2 ' +
  '01 e0 19 fe 02 1c 1a 3a 02 58 1a 76 12 94 1a b2 02 d0 12 ee 1b 0c 03 2a 1b 48 03 66 1b 84 03 a2 ' +
  '13 c0 1b de 03 fc 1c 1a 04 38 1c 56 04 74 1c 92 04 b0 1c ce 04 ec 1d 0a 05 28 1d 46 15 64 1d 82 ' +
  '00 00 18 1e 00 3c 18 5a 00 78 10 96 18 b4 10 d2 00 f0 19 0e 01 2c 19 4a 01 68 11 86 19 a4 11 c2 ' +
  '01 e0 19 fe 12 1c 02 3a 1a 58 12 76 1a 94 02 b2 12 d0 1a ee 03 0c 1b 2a 63 48 00 a6 00 0e 5e 0e ' +
  '84 00 06 02 00 00 60 00 00 0e 00 0e 5e 0f d5 80 06 03 00 00 60 00';

function bytes(hex: string): Uint8Array {
  return Uint8Array.from(
    hex
      .trim()
      .split(/\s+/)
      .map((h) => Number.parseInt(h, 16)),
  );
}

const be16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >> 16) & 0xff,
  (n >> 8) & 0xff,
  n & 0xff,
];
const seconds = (date: string): number => Date.parse(`${date}T00:00:00Z`) / 1000;

/** A download record: the file id, the appendix (00 first generation data, 02 second), the length, the bytes. */
function record(file: number, appendix: number, data: Uint8Array | number[]): Uint8Array {
  return Uint8Array.from([file >> 8, file & 0xff, appendix, ...be16(data.length), ...data]);
}

/** A change of activity: `inserted` is the card being in a tachograph; activity 0 rest, 1 availability, 2 work, 3 driving. */
function change(inserted: boolean, activity: 0 | 1 | 2 | 3, minute: number): number {
  return (inserted ? 0 : 0x2000) | (activity << 11) | minute;
}

interface Day {
  /** Midnight UTC of the day, as `YYYY-MM-DD`. */
  readonly date: string;
  readonly changes: readonly number[];
}

const day = (date: string, ...changes: number[]): Day => ({ date, changes });
const working = (date: string): Day => day(date, change(true, 3, 60), change(true, 0, 600));
const resting = (date: string): Day => day(date, change(false, 0, 0));

interface Layout {
  /** The size of the cyclic buffer. */
  readonly size?: number;
  /** Where the oldest record starts; the rest follow it, wrapping round the end. */
  readonly start?: number;
}

/** The data of a driver activity file: the two pointers, then the cyclic buffer with the days written into it oldest first. */
function activityData(days: readonly Day[], layout: Layout = {}): Uint8Array {
  const size = layout.size ?? 600;
  const start = layout.start ?? 0;
  const buffer = new Uint8Array(size);
  let at = start;
  let previousLength = 0;
  let newest = start;
  for (const d of days) {
    const length = 12 + 2 * d.changes.length;
    const whole = [
      ...be16(previousLength),
      ...be16(length),
      ...be32(seconds(d.date)),
      ...be16(0x0001),
      ...be16(0),
      ...d.changes.flatMap(be16),
    ];
    whole.forEach((value, i) => {
      buffer[(at + i) % size] = value;
    });
    newest = at;
    previousLength = length;
    at = (at + length) % size;
  }
  return Uint8Array.from([...be16(start), ...be16(newest), ...buffer]);
}

const file = (days: readonly Day[], layout?: Layout): Uint8Array =>
  record(0x0504, 0x00, activityData(days, layout));

describe('readCardActivity on real card data', () => {
  it('reads the period and the days the card was in use from the first records of a real file', () => {
    const buffer = new Uint8Array(500);
    buffer.set(bytes(SAMPLE_HEX));
    const data = Uint8Array.from([...be16(0), ...be16(148 + 166 + 14), ...buffer]);
    expect(readCardActivity(record(0x0504, 0x00, data))).toEqual({
      from: '2020-01-01',
      to: '2020-01-04',
      workDays: 2,
    });
  });
});

describe('readCardActivity', () => {
  const days = [
    working('2026-11-01'),
    resting('2026-11-02'),
    day('2026-11-03', change(true, 0, 0), change(true, 1, 420), change(true, 0, 900)),
    day('2026-11-04', change(true, 0, 30)),
    day('2026-11-05', change(false, 3, 0)),
    working('2026-11-06'),
  ];
  const expected = { from: '2026-11-01', to: '2026-11-06', workDays: 3 };

  it('gives the first and last day and counts the days with driving, work or availability on the card', () => {
    expect(readCardActivity(file(days))).toEqual(expected);
  });

  it('does not count a day of rest with the card in, or activity with the card out', () => {
    expect(readCardActivity(file([working('2026-11-01'), resting('2026-11-02')]))?.workDays).toBe(
      1,
    );
    expect(
      readCardActivity(file([day('2026-11-04', change(true, 0, 30)), resting('2026-11-05')]))
        ?.workDays,
    ).toBe(0);
  });

  it('reads one day on its own', () => {
    expect(readCardActivity(file([working('2026-11-06')]))).toEqual({
      from: '2026-11-06',
      to: '2026-11-06',
      workDays: 1,
    });
  });

  it('reads a buffer the records have wrapped round, including a record split by the end of it', () => {
    // The six records are 92 bytes in a buffer of 150; each start puts the end of the buffer in a different place.
    for (const start of [0, 1, 40, 59, 66, 99, 149]) {
      expect(readCardActivity(file(days, { size: 150, start }))).toEqual(expected);
    }
  });

  it('reads the first generation copy, or the second generation one when that is all there is', () => {
    const first = activityData([working('2026-11-01'), working('2026-11-02')]);
    const second = activityData(days);
    expect(
      readCardActivity(
        Uint8Array.from([...record(0x0504, 0x00, first), ...record(0x0504, 0x02, second)]),
      ),
    ).toEqual({ from: '2026-11-01', to: '2026-11-02', workDays: 2 });
    expect(readCardActivity(record(0x0504, 0x02, second))).toEqual(expected);
  });

  it('falls back to the other generation when the first one does not read', () => {
    const broken = Uint8Array.from(activityData(days));
    broken.set([0xff, 0xff], 0);
    expect(
      readCardActivity(
        Uint8Array.from([
          ...record(0x0504, 0x00, broken),
          ...record(0x0504, 0x02, activityData(days)),
        ]),
      ),
    ).toEqual(expected);
  });

  it('gives nothing for a file with no activity, an empty buffer, or the wrong file', () => {
    expect(readCardActivity(new Uint8Array(0))).toBeUndefined();
    expect(readCardActivity(record(0x0520, 0x00, activityData(days)))).toBeUndefined();
    expect(readCardActivity(record(0x0504, 0x00, new Uint8Array(604)))).toBeUndefined();
    expect(readCardActivity(record(0x0504, 0x00, [0, 0, 0, 0]))).toBeUndefined();
  });

  it('gives nothing, not a shorter period, when the records do not add up', () => {
    const good = activityData(days);
    const damaged = (edit: (data: Uint8Array) => void): Uint8Array => {
      const copy = Uint8Array.from(good);
      edit(copy);
      return record(0x0504, 0x00, copy);
    };
    // The newest record says the one before it is a different length from what that one says it is.
    expect(readCardActivity(damaged((d) => d.set(be16(30), 4 + 76)))).toBeUndefined();
    // A pointer outside the buffer.
    expect(readCardActivity(damaged((d) => d.set([0x7f, 0xff], 2)))).toBeUndefined();
    // A day that is not before the one after it: the oldest record is given a date after the next.
    expect(
      readCardActivity(damaged((d) => d.set(be32(seconds('2026-12-31')), 4 + 4))),
    ).toBeUndefined();
    // A date far in the future.
    expect(readCardActivity(damaged((d) => d.set(be32(0xfffffff0), 4 + 4)))).toBeUndefined();
    // A change at minute 1500.
    expect(readCardActivity(file([day('2026-11-06', change(true, 3, 1500))]))).toBeUndefined();
    // The oldest pointer is not on a record, so the walk goes round past it.
    expect(readCardActivity(damaged((d) => d.set(be16(3), 0)))).toBeUndefined();
  });

  it('copes with a truncated file and with rubbish', () => {
    const whole = file(days);
    expect(readCardActivity(whole.subarray(0, whole.length - 10))).toBeUndefined();
    const rubbish = Uint8Array.from({ length: 5000 }, (_, i) => (i * 131 + 7) & 0xff);
    expect(() => readCardActivity(record(0x0504, 0x00, rubbish))).not.toThrow();
    expect(readCardActivity(record(0x0504, 0x00, rubbish))).toBeUndefined();
  });
});
