import { describe, expect, it } from 'vitest';
import { readCardIdentity } from './card-identity.js';

/**
 * The identification file of a driver card (143 bytes), copied from way-platform/tachograph-go's anonymised test records (MIT
 * licence): a Finnish card in the name of John Doe, expiring 2024-12-31. The offsets in `card-identity.ts` were checked against it.
 */
const SAMPLE_HEX =
  '12 44 52 49 56 45 52 30 30 30 30 30 30 30 31 30 ' +
  '30 01 54 72 61 6e 73 70 6f 72 74 20 61 6e 64 20 ' +
  '43 6f 6d 6d 75 6e 69 63 61 74 69 6f 6e 73 20 41 ' +
  '67 65 6e 63 79 5e 0b e1 00 5e 0b e1 00 67 74 85 ' +
  '7f 01 44 6f 65 20 20 20 20 20 20 20 20 20 20 20 ' +
  '20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 ' +
  '20 20 20 20 20 01 4a 6f 68 6e 20 20 20 20 20 20 ' +
  '20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 ' +
  '20 20 20 20 20 20 20 20 20 20 00 01 01 66 69 ';

function bytes(hex: string): Uint8Array {
  return Uint8Array.from(
    hex
      .trim()
      .split(/\s+/)
      .map((h) => Number.parseInt(h, 16)),
  );
}

/** A download record: the file id, the appendix (00 first generation data, 02 second), the length, the bytes. */
function record(file: number, appendix: number, data: Uint8Array): Uint8Array {
  const head = Uint8Array.of(
    file >> 8,
    file & 0xff,
    appendix,
    data.length >> 8,
    data.length & 0xff,
  );
  const out = new Uint8Array(head.length + data.length);
  out.set(head);
  out.set(data, head.length);
  return out;
}
const join = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const sample = bytes(SAMPLE_HEX);

describe('the sample', () => {
  it('is the 143 bytes of an identification file', () => {
    expect(sample.length).toBe(143);
  });
});

describe('readCardIdentity', () => {
  it('reads the card number, holder and expiry from a first generation file', () => {
    const file = join(
      record(0x0002, 0x00, new Uint8Array(25)),
      record(0x0520, 0x00, sample),
      record(0x0520, 0x01, new Uint8Array(128)),
    );
    expect(readCardIdentity(file)).toEqual({
      cardNumber: 'DRIVER0000000100',
      holderName: 'John Doe',
      expiresOn: '2024-12-31',
      generations: '1',
    });
  });

  it('prefers the second generation copy and says both are there', () => {
    const second = Uint8Array.from(sample);
    // A different expiry (2031-06-30T23:59:59Z = 1939...), so the choice can be seen.
    second.set([0x73, 0x0c, 0x9a, 0x3f], 1 + 16 + 36 + 4 + 4);
    const file = join(record(0x0520, 0x00, sample), record(0x0520, 0x02, second));
    const identity = readCardIdentity(file);
    expect(identity?.generations).toBe('1,2');
    expect(identity?.expiresOn).not.toBe('2024-12-31');
  });

  it('reads a second generation card with no first generation copy', () => {
    expect(readCardIdentity(record(0x0520, 0x02, sample))?.generations).toBe('2');
  });

  it('gives the surname alone when the first names do not read', () => {
    const odd = Uint8Array.from(sample);
    odd[65 + 36] = 0x05; // an unsupported code page for the first names
    expect(readCardIdentity(record(0x0520, 0x00, odd))?.holderName).toBe('Doe');
  });

  it('gives nothing for a file with no identification, or one of the wrong length', () => {
    expect(readCardIdentity(record(0x0002, 0x00, new Uint8Array(25)))).toBeUndefined();
    expect(readCardIdentity(record(0x0520, 0x00, sample.subarray(0, 142)))).toBeUndefined();
    expect(readCardIdentity(new Uint8Array(0))).toBeUndefined();
  });

  it('gives nothing when a field is not sane, rather than a wrong name', () => {
    const noExpiry = Uint8Array.from(sample);
    noExpiry.set([0, 0, 0, 0], 1 + 16 + 36 + 4 + 4);
    expect(readCardIdentity(record(0x0520, 0x00, noExpiry))).toBeUndefined();

    const farOff = Uint8Array.from(sample);
    farOff.set([0xff, 0xff, 0xff, 0xfe], 1 + 16 + 36 + 4 + 4);
    expect(readCardIdentity(record(0x0520, 0x00, farOff))).toBeUndefined();

    const randomName = Uint8Array.from(sample);
    randomName.set([0x01, 0x07, 0x1b, 0x90, 0xfe], 65);
    expect(readCardIdentity(record(0x0520, 0x00, randomName))).toBeUndefined();

    const badNumber = Uint8Array.from(sample);
    badNumber.set([0x00, 0x01, 0x02], 1);
    expect(readCardIdentity(record(0x0520, 0x00, badNumber))).toBeUndefined();
  });

  it('copes with a truncated file and with rubbish', () => {
    const file = join(record(0x0002, 0x00, new Uint8Array(25)), record(0x0520, 0x00, sample));
    expect(readCardIdentity(file.subarray(0, file.length - 10))).toBeUndefined();
    const rubbish = Uint8Array.from({ length: 5000 }, (_, i) => (i * 131 + 7) & 0xff);
    expect(() => readCardIdentity(rubbish)).not.toThrow();
  });
});
