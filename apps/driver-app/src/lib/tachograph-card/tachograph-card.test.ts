import {
  COMPUTE_DIGITAL_SIGNATURE,
  getResponse,
  PERFORM_HASH_OF_FILE,
  readBinary,
  selectApplication,
  selectFile,
  splitResponse,
  swText,
  TACHOGRAPH_AID,
} from './apdu';
import {
  APPLICATION_FILES,
  FID,
  parseAppIdentification,
  ROOT_FILES,
  TOTAL_STEPS,
} from './card-files';
import { buildDdd, DddFormatError, encodeRecord, parseDdd } from './ddd';
import { downloadDriverCard } from './download-card';
import { CardError, cardErrorText } from './errors';
import { exchange } from './reader';
import { SimulatedCard } from './simulated-card';

const hex = (b: Uint8Array): string =>
  [...b]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join(' ')
    .toUpperCase();

describe('the commands', () => {
  it('are the bytes a card expects', () => {
    expect(hex(selectApplication(TACHOGRAPH_AID))).toBe('00 A4 04 0C 06 FF 54 41 43 48 4F');
    expect(hex(selectFile(0x0504))).toBe('00 A4 02 0C 02 05 04');
    expect(hex(readBinary(0, 200))).toBe('00 B0 00 00 C8');
    expect(hex(readBinary(13000, 200))).toBe('00 B0 32 C8 C8');
    expect(hex(readBinary(0, 256))).toBe('00 B0 00 00 00');
    expect(hex(PERFORM_HASH_OF_FILE)).toBe('80 2A 90 00');
    expect(hex(COMPUTE_DIGITAL_SIGNATURE)).toBe('00 2A 9E 9A 80');
    expect(hex(getResponse(200))).toBe('00 C0 00 00 C8');
  });

  it('refuse an offset or length a card cannot take', () => {
    expect(() => readBinary(0x8000, 10)).toThrow(RangeError);
    expect(() => readBinary(0, 0)).toThrow(RangeError);
    expect(() => readBinary(0, 257)).toThrow(RangeError);
  });

  it('split an answer into its data and status', () => {
    expect(splitResponse(Uint8Array.from([1, 2, 3, 0x90, 0x00]))).toEqual({
      data: Uint8Array.from([1, 2, 3]),
      sw: 0x9000,
    });
    expect(swText(0x6a82)).toBe('6A82');
    expect(() => splitResponse(Uint8Array.from([0x90]))).toThrow(RangeError);
  });
});

describe('the download file layout', () => {
  it('writes each record as file id, 00 or 01, two length bytes, then the bytes', () => {
    const record = encodeRecord({ fid: 0x0504, appendix: 0x00, data: Uint8Array.from([9, 8, 7]) });
    expect(hex(record)).toBe('05 04 00 00 03 09 08 07');
    expect(hex(encodeRecord({ fid: 0x0504, appendix: 0x01, data: new Uint8Array(0) }))).toBe(
      '05 04 01 00 00',
    );
  });

  it('reads back what it wrote, and notices a file that is cut or has bytes left over', () => {
    const bytes = buildDdd([
      { fid: 0x0002, appendix: 0, data: Uint8Array.from([1, 2]) },
      { fid: 0x0501, appendix: 1, data: Uint8Array.from([3]) },
    ]);
    expect(parseDdd(bytes).map((r) => [r.fid, r.appendix, r.data.length])).toEqual([
      [0x0002, 0, 2],
      [0x0501, 1, 1],
    ]);
    expect(() => parseDdd(bytes.subarray(0, bytes.length - 1))).toThrow(DddFormatError);
    expect(() => parseDdd(Uint8Array.from([...bytes, 0xff]))).toThrow(DddFormatError);
    expect(() => parseDdd(new Uint8Array(0))).toThrow(DddFormatError);
  });
});

describe('downloading a driver card', () => {
  it('reads every file in the right order, with a signature after each signed one, byte for byte', async () => {
    const card = new SimulatedCard();
    const result = await downloadDriverCard(card);
    const records = parseDdd(result.ddd);

    const expectedOrder = [
      ...ROOT_FILES.map((f) => f.fid),
      FID.APPLICATION_IDENTIFICATION,
      ...APPLICATION_FILES.map((f) => f.fid),
    ];
    const dataOrder = records.filter((r) => r.appendix === 0).map((r) => r.fid);
    expect(dataOrder).toEqual(expectedOrder);

    // Every file's bytes are exactly the card's, and a signature record follows exactly the signed ones, straight after.
    for (const [i, record] of records.entries()) {
      if (record.appendix === 0) {
        expect(record.data).toEqual(card.fileBytes(record.fid));
        const spec = [...ROOT_FILES, ...APPLICATION_FILES].find((f) => f.fid === record.fid);
        const signed = record.fid === FID.APPLICATION_IDENTIFICATION || spec?.signed === true;
        const next = records[i + 1];
        if (signed) {
          expect(next?.fid).toBe(record.fid);
          expect(next?.appendix).toBe(1);
          expect(next?.data).toEqual(card.signatureFor(record.fid));
          expect(next?.data.length).toBe(128);
        } else {
          expect(next?.fid === record.fid && next?.appendix === 1).toBe(false);
        }
      }
    }
    expect(result.files).toHaveLength(TOTAL_STEPS);
    expect(result.files.every((f) => !f.skipped)).toBe(true);
  });

  it('sizes the files from the counters on the card, and reads the big one in pieces of at most 200 bytes', async () => {
    const card = new SimulatedCard();
    const result = await downloadDriverCard(card);
    const sizes = new Map(result.files.map((f) => [f.fid, f.bytes]));
    expect(sizes.get(FID.DRIVER_ACTIVITY_DATA)).toBe(13776 + 4);
    expect(sizes.get(FID.EVENTS_DATA)).toBe(6 * 24 * 6);
    expect(sizes.get(FID.FAULTS_DATA)).toBe(12 * 24 * 2);
    expect(sizes.get(FID.VEHICLES_USED)).toBe(200 * 31 + 2);
    expect(sizes.get(FID.PLACES)).toBe(84 * 10 + 1);
    const reads = card.log.filter((c) => c[1] === 0xb0);
    expect(reads.every((c) => (c[4] as number) <= 200 && (c[4] as number) !== 0)).toBe(true);
    expect(reads.length).toBeGreaterThan(Math.ceil((13776 + 4) / 200));
  });

  it('follows the order of commands a card is used to: the top files, the application, then hash before read before signature', async () => {
    const card = new SimulatedCard();
    await downloadDriverCard(card);
    const names = card.log.map((c) => hex(c.subarray(0, 4)));
    expect(names[0]).toBe('00 A4 02 0C'); // EF_ICC
    expect(hex(card.log[0] as Uint8Array)).toBe('00 A4 02 0C 02 00 02');
    expect(hex(card.log[2] as Uint8Array)).toBe('00 A4 02 0C 02 00 05');
    const aidAt = card.log.findIndex((c) => hex(c) === hex(selectApplication(TACHOGRAPH_AID)));
    expect(aidAt).toBeGreaterThan(2);

    // For a signed file: select, hash, read..., sign.
    const activity = card.log.findIndex(
      (c) => hex(c) === hex(selectFile(FID.DRIVER_ACTIVITY_DATA)),
    );
    expect(hex(card.log[activity + 1] as Uint8Array)).toBe('80 2A 90 00');
    expect((card.log[activity + 2] as Uint8Array)[1]).toBe(0xb0);
    const sign = card.log.findIndex((c, i) => i > activity && hex(c) === '00 2A 9E 9A 80');
    expect(sign).toBeGreaterThan(activity + 2);
    // An unsigned file (the certificate) is never hashed.
    const cert = card.log.findIndex((c) => hex(c) === hex(selectFile(FID.CARD_CERTIFICATE)));
    expect(hex(card.log[cert + 1] as Uint8Array).startsWith('00 B0')).toBe(true);
  });

  it('gives the same file from a card that answers like T=0 and says "more data waiting"', async () => {
    const plain = await downloadDriverCard(new SimulatedCard());
    const t0Card = new SimulatedCard({ t0: true });
    const t0 = await downloadDriverCard(t0Card);
    expect(t0.ddd).toEqual(plain.ddd);
    expect(t0Card.log.some((c) => c[1] === 0xc0)).toBe(true); // GET RESPONSE was used
  });

  it('reports progress for each file, from the first to the last', async () => {
    const seen: number[] = [];
    const names: string[] = [];
    await downloadDriverCard(new SimulatedCard(), {
      onProgress: (p) => {
        seen.push(p.step);
        names.push(p.file);
        expect(p.steps).toBe(TOTAL_STEPS);
      },
    });
    expect(seen[0]).toBe(0);
    expect(Math.max(...seen)).toBe(TOTAL_STEPS - 1);
    expect(names).toContain('Driver activity');
  });

  it('turns the card off when it is done, even after a failure', async () => {
    const off: string[] = [];
    const card = new SimulatedCard({ removeAfterCommands: 5 });
    const powerOff = card.powerOff.bind(card);
    card.powerOff = () => {
      off.push('off');
      return powerOff();
    };
    await expect(downloadDriverCard(card)).rejects.toBeInstanceOf(CardError);
    expect(off).toEqual(['off']);
  });
});

describe('when something is not right', () => {
  const fails = (card: SimulatedCard, code: string) =>
    expect(downloadDriverCard(card)).rejects.toMatchObject({ code });

  it('says there is no card', () => fails(new SimulatedCard({ noCard: true }), 'no_card'));
  it('says the card was taken out', () =>
    fails(new SimulatedCard({ removeAfterCommands: 40 }), 'card_removed'));
  it('says it is not a driver card', () =>
    fails(new SimulatedCard({ cardType: 2 }), 'not_driver_card'));
  it.each([0x6a86, 0x6a82, 0x6d00])(
    'says a bank card is not a driver card, whatever its refusal (%#x)',
    async (sw) => {
      const bankCard = {
        powerOn: async () => Uint8Array.from([0x3b, 0x00]),
        transmit: async () => Uint8Array.from([sw >> 8, sw & 0xff]),
        powerOff: async () => undefined,
      };
      await expect(downloadDriverCard(bankCard)).rejects.toMatchObject({
        code: 'not_driver_card',
      });
    },
  );
  it('still calls a damaged driver card damaged when a later file is missing', () =>
    fails(new SimulatedCard({ missing: [FID.DRIVER_ACTIVITY_DATA] }), 'file_missing'));
  it('says a needed file is missing', () =>
    fails(new SimulatedCard({ missing: [FID.DRIVER_ACTIVITY_DATA] }), 'file_missing'));
  it('says the card would not sign', () =>
    fails(new SimulatedCard({ refuseSigning: true }), 'signature_failed'));

  it('copes with an older card that lacks the optional file, and says it was skipped', async () => {
    const result = await downloadDriverCard(
      new SimulatedCard({ missing: [FID.SPECIFIC_CONDITIONS] }),
    );
    expect(result.files.find((f) => f.fid === FID.SPECIFIC_CONDITIONS)?.skipped).toBe(true);
    expect(parseDdd(result.ddd).some((r) => r.fid === FID.SPECIFIC_CONDITIONS)).toBe(false);
  });

  it('stops when asked', async () => {
    const controller = new AbortController();
    const card = new SimulatedCard();
    await expect(
      downloadDriverCard(card, {
        signal: controller.signal,
        onProgress: (p) => {
          if (p.step === 3) controller.abort();
        },
      }),
    ).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('tells a driver in plain words, never the status codes', () => {
    for (const code of [
      'no_card',
      'card_removed',
      'not_driver_card',
      'signature_failed',
    ] as const) {
      const text = cardErrorText(new CardError(code, 'SW 6A82'));
      expect(text).not.toMatch(/6A82|SW/);
      expect(text.length).toBeGreaterThan(20);
    }
    expect(cardErrorText(new Error('boom'))).toMatch(/did not understand/);
  });
});

describe('reading the identification counters', () => {
  it('takes the type and the sizes from the ten bytes', () => {
    expect(
      parseAppIdentification(Uint8Array.from([1, 0, 1, 6, 12, 0x35, 0xd0, 0x00, 0xc8, 84])),
    ).toEqual({
      cardType: 1,
      eventsPerType: 6,
      faultsPerType: 12,
      activityStructureLength: 13776,
      vehicleRecords: 200,
      placeRecords: 84,
    });
    expect(parseAppIdentification(new Uint8Array(9))).toBeUndefined();
  });
});

describe('a T=0 reader that leaves the follow-up to us', () => {
  it('collects waiting data, and repeats a command with the length the card names', async () => {
    const sent: string[] = [];
    const reader = {
      powerOn: () => Promise.resolve(new Uint8Array()),
      powerOff: () => Promise.resolve(),
      transmit: (c: Uint8Array) => {
        sent.push(hex(c));
        if (hex(c) === '00 B0 00 00 C8') return Promise.resolve(Uint8Array.from([0x6c, 0x10]));
        if (hex(c) === '00 B0 00 00 10') return Promise.resolve(Uint8Array.from([0x61, 0x10]));
        if (hex(c) === '00 C0 00 00 10') {
          return Promise.resolve(Uint8Array.from([...new Uint8Array(16).fill(7), 0x90, 0x00]));
        }
        return Promise.resolve(Uint8Array.from([0x6d, 0x00]));
      },
    };
    const answer = await exchange(reader, readBinary(0, 200));
    expect(answer.sw).toBe(0x9000);
    expect(answer.data).toEqual(new Uint8Array(16).fill(7));
    expect(sent).toEqual(['00 B0 00 00 C8', '00 B0 00 00 10', '00 C0 00 00 10']);
  });
});
