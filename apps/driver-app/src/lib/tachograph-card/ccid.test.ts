import { fromBase64, toBase64 } from './base64';
import { atrProtocol, CcidReader, parseCcidDescriptor, type CcidInfo } from './ccid';
import { downloadDriverCard } from './download-card';
import { CardError } from './errors';
import {
  fakeDescriptors as descriptors,
  FakeCcidReader,
  type FakeCcidOptions,
} from './fake-ccid-reader';
import { SimulatedCard, type SimulatedCardOptions } from './simulated-card';

const APDU_LEVEL = 0x20000 | 0x2 | 0x4 | 0x8 | 0x10 | 0x20 | 0x40;
const TPDU_LEVEL = 0x10000 | 0x2 | 0x4 | 0x8 | 0x10 | 0x20 | 0x40;

function info(level: 'apdu' | 'tpdu'): CcidInfo {
  const parsed = parseCcidDescriptor(descriptors(level === 'apdu' ? APDU_LEVEL : TPDU_LEVEL));
  if (parsed === undefined) throw new Error('descriptor');
  return parsed;
}

function reader(
  options: FakeCcidOptions = {},
  card: SimulatedCardOptions = {},
  level: 'apdu' | 'tpdu' = options.level ?? 'apdu',
) {
  const fake = new FakeCcidReader(new SimulatedCard(card), { ...options, level });
  const log: string[] = [];
  const ccid = new CcidReader(fake, info(level), { log: (l) => log.push(l), timeoutMs: 50 });
  return { fake, ccid, log };
}

describe('the reader class descriptor', () => {
  it('says what level the reader works at, and which cards it takes', () => {
    expect(parseCcidDescriptor(descriptors(APDU_LEVEL))).toMatchObject({
      level: 'apdu',
      protocols: 3,
      maxSlotIndex: 0,
      maxMessageLength: 271,
    });
    expect(parseCcidDescriptor(descriptors(TPDU_LEVEL))?.level).toBe('tpdu');
    expect(parseCcidDescriptor(descriptors(0x40000))?.level).toBe('extended_apdu');
    expect(parseCcidDescriptor(descriptors(0))?.level).toBe('character');
  });

  it('is not found on a device that is not a card reader', () => {
    const notCcid = descriptors(APDU_LEVEL);
    notCcid[9 + 18 + 5] = 0x03; // the interface class, now a keyboard
    expect(parseCcidDescriptor(notCcid)).toBeUndefined();
    expect(parseCcidDescriptor(Uint8Array.from([18, 1, 0, 2]))).toBeUndefined();
    expect(parseCcidDescriptor(new Uint8Array(0))).toBeUndefined();
  });
});

describe('the first protocol a card names', () => {
  it('is T=0 when none is named, and the named one when there is one', () => {
    expect(atrProtocol(Uint8Array.from([0x3b, 0x00]))).toBe(0);
    expect(atrProtocol(Uint8Array.from([0x3b, 0x80, 0x01]))).toBe(1);
    expect(atrProtocol(Uint8Array.from([0x3b, 0x90, 0x95, 0x80]))).toBe(0);
    expect(atrProtocol(Uint8Array.from([0x3b, 0xd0, 0x18, 0x12, 0x81]))).toBe(1);
    expect(atrProtocol(Uint8Array.from([0x3b]))).toBe(0);
  });
});

describe('base64', () => {
  it('round-trips bytes of every length', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 0xff);
      expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    }
    expect(toBase64(Uint8Array.from([77, 97, 110]))).toBe('TWFu');
    expect(toBase64(Uint8Array.from([77, 97]))).toBe('TWE=');
    expect(() => fromBase64('!!')).toThrow();
  });
});

describe('a whole download through a pretend USB reader', () => {
  it.each([
    ['a reader that takes whole commands', { level: 'apdu' as const }, {}],
    ['one that takes whole commands, small packets', { level: 'apdu' as const, packetSize: 8 }, {}],
    ['a transport-level reader and a T=0 card', { level: 'tpdu' as const }, { t0: true }],
    ['a reader that keeps saying it needs time', { extensions: 3 }, {}],
    ['a reader with a stray message waiting', { strayFirst: true }, {}],
    [
      'a reader that will not say its protocol',
      { level: 'tpdu' as const, noGetParameters: true },
      { t0: true },
    ],
  ])('reads %s to the end', async (_name, options, card) => {
    const { ccid } = reader(options, card);
    const result = await downloadDriverCard(ccid);
    const direct = await downloadDriverCard(new SimulatedCard(card));
    // The file is the same as reading the card with no reader in between.
    expect(result.ddd).toEqual(direct.ddd);
    expect(result.files).toHaveLength(16);
  });

  it('adds the length byte a transport-level reader needs to a four-byte command', async () => {
    const { ccid, fake } = reader({ level: 'tpdu' }, { t0: true });
    await downloadDriverCard(ccid);
    const hash = fake.written.find((m) => m[0] === 0x6f && m[10] === 0x80 && m[11] === 0x2a);
    expect(hash).toBeDefined();
    expect((hash?.[1] ?? 0) | ((hash?.[2] ?? 0) << 8)).toBe(5);
  });

  it('numbers each message in turn', async () => {
    const { ccid, fake } = reader();
    await downloadDriverCard(ccid);
    const seqs = fake.written.map((m) => m[6]);
    expect(seqs.slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(fake.written[0]?.[0]).toBe(0x65);
    expect(fake.written[1]?.[0]).toBe(0x62);
  });
});

describe('what goes wrong', () => {
  const code = async (p: Promise<unknown>): Promise<string> => {
    try {
      await p;
      return 'no error';
    } catch (error) {
      return error instanceof CardError ? error.code : String(error);
    }
  };

  it('says there is no card when the slot is empty', async () => {
    const { ccid } = reader({ noCard: true }, { noCard: true });
    expect(await code(downloadDriverCard(ccid))).toBe('no_card');
  });

  it('says the card was taken out when it goes part way', async () => {
    const { ccid } = reader({}, { removeAfterCommands: 40 });
    expect(await code(downloadDriverCard(ccid))).toBe('card_removed');
  });

  it('says the reader did not answer when it is silent', async () => {
    const { ccid } = reader({ silent: true });
    expect(await code(downloadDriverCard(ccid))).toBe('read_failed');
  });

  it('refuses a transport-level reader that chose T=1, saying so', async () => {
    const { ccid, log } = reader({ level: 'tpdu', protocol: 1 });
    expect(await code(downloadDriverCard(ccid))).toBe('protocol');
    expect(log.join('\n')).toContain('reader chose protocol T=1');
  });

  it('refuses a reader that works one character at a time', async () => {
    const fake = new FakeCcidReader(new SimulatedCard());
    const character = parseCcidDescriptor(descriptors(0)) as CcidInfo;
    expect(await code(downloadDriverCard(new CcidReader(fake, character)))).toBe('protocol');
  });

  it('never puts the card data in the log, only sizes and status words', async () => {
    const { ccid, log } = reader();
    await downloadDriverCard(ccid);
    expect(log.length).toBeGreaterThan(10);
    expect(log.every((line) => line.length < 60)).toBe(true);
    expect(log.join('\n')).not.toMatch(/SIMULATED/);
  });
});
