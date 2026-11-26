import {
  SW_CONDITIONS_NOT_SATISFIED,
  SW_END_OF_FILE,
  SW_FILE_NOT_FOUND,
  SW_OK,
  TACHOGRAPH_AID,
} from './apdu';
import {
  APPLICATION_FILES,
  APPLICATION_IDENTIFICATION,
  FID,
  ROOT_FILES,
  type AppIdentification,
  type CardFileSpec,
} from './card-files';
import { CardError } from './errors';
import type { CardReader } from './reader';

export interface SimulatedCardOptions {
  /** No card in the reader: `powerOn` rejects. */
  readonly noCard?: boolean;
  /** The card is taken out after this many commands. */
  readonly removeAfterCommands?: number;
  /** Files the card does not have (to try an older card without the optional file, or a damaged one). */
  readonly missing?: readonly number[];
  /** Answer like a T=0 card: data waiting is announced (`61xx`) and collected with GET RESPONSE. */
  readonly t0?: boolean;
  /** The card type byte: 1 is a driver card, 2 a workshop card. */
  readonly cardType?: number;
  /** Refuse to hash or sign (a card that will not sign). */
  readonly refuseSigning?: boolean;
  /** Counters that size the files; the defaults are the usual first-generation values. */
  readonly counters?: Partial<AppIdentification>;
}

const DEFAULT_COUNTERS: Omit<AppIdentification, 'cardType'> = {
  eventsPerType: 6,
  faultsPerType: 12,
  activityStructureLength: 13776,
  vehicleRecords: 200,
  placeRecords: 84,
};

/** A repeatable stream of bytes from a seed, so the same fake card is the same every run. */
function bytesFor(seed: number, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let x = (seed * 2654435761) >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

/**
 * A stand-in for a first-generation driver card behind a reader, speaking the same commands (select, read binary, hash, sign) and
 * answering with the same status words, for building and testing the download with no reader and no card. Everything on it is
 * invented: the data is random bytes of the right size, the holder is "SIMULATED", and the signatures are fake. It proves the
 * download logic and the file layout hang together; it does NOT prove a real card or reader behaves the same, and nothing it holds is a
 * real person's record.
 */
export class SimulatedCard implements CardReader {
  /** Every command received, so a test can see the exact sequence. */
  readonly log: Uint8Array[] = [];
  readonly #options: SimulatedCardOptions;
  readonly #files = new Map<number, { spec: CardFileSpec; data: Uint8Array; root: boolean }>();
  #powered = false;
  #inApplication = false;
  #selected: number | undefined;
  #hashed: number | undefined;
  #pending: Uint8Array | undefined;
  #commands = 0;

  constructor(options: SimulatedCardOptions = {}) {
    this.#options = options;
    const counters: AppIdentification = {
      cardType: options.cardType ?? 1,
      ...DEFAULT_COUNTERS,
      ...options.counters,
    };
    const missing = new Set(options.missing ?? []);
    const add = (spec: CardFileSpec, root: boolean, data: Uint8Array) => {
      if (!missing.has(spec.fid)) this.#files.set(spec.fid, { spec, data, root });
    };
    for (const spec of ROOT_FILES) add(spec, true, bytesFor(spec.fid, spec.size(counters)));
    add(APPLICATION_IDENTIFICATION, false, this.#applicationIdentification(counters));
    for (const spec of APPLICATION_FILES) {
      const data =
        spec.fid === FID.IDENTIFICATION
          ? this.#identification()
          : bytesFor(spec.fid, spec.size(counters));
      add(spec, false, data);
    }
  }

  /** The ten bytes whose counters size the other files. */
  #applicationIdentification(c: AppIdentification): Uint8Array {
    return Uint8Array.from([
      c.cardType,
      0x00,
      0x01,
      c.eventsPerType,
      c.faultsPerType,
      (c.activityStructureLength >> 8) & 0xff,
      c.activityStructureLength & 0xff,
      (c.vehicleRecords >> 8) & 0xff,
      c.vehicleRecords & 0xff,
      c.placeRecords,
    ]);
  }

  /** The card and holder details: an invented card number and holder, so no real person's name is ever used. */
  #identification(): Uint8Array {
    const data = bytesFor(FID.IDENTIFICATION, 143);
    data.fill(0x20);
    data.set(ascii('SIMULATED000001'), 0);
    data.set(ascii('SIMULATED'), 65);
    data.set(ascii('DRIVER'), 101);
    return data;
  }

  /** The bytes of a file as the card holds them, for a test to compare a download with. */
  fileBytes(fid: number): Uint8Array | undefined {
    return this.#files.get(fid)?.data;
  }

  powerOn(): Promise<Uint8Array> {
    if (this.#options.noCard === true) return Promise.reject(new CardError('no_card', 'no card'));
    this.#powered = true;
    this.#inApplication = false;
    this.#selected = undefined;
    this.#hashed = undefined;
    // A plausible answer-to-reset for a T=0 card: 3B then a few bytes. Invented.
    return Promise.resolve(Uint8Array.from([0x3b, 0xdf, 0x95, 0x00, 0x81, 0x31]));
  }

  powerOff(): Promise<void> {
    this.#powered = false;
    return Promise.resolve();
  }

  transmit(command: Uint8Array): Promise<Uint8Array> {
    if (!this.#powered) return Promise.reject(new CardError('no_card', 'card is off'));
    this.#commands++;
    this.log.push(Uint8Array.from(command));
    const removeAfter = this.#options.removeAfterCommands;
    if (removeAfter !== undefined && this.#commands > removeAfter) {
      return Promise.reject(new CardError('card_removed', 'card removed'));
    }
    return Promise.resolve(this.#answer(command));
  }

  #sw(sw: number, data: Uint8Array = new Uint8Array()): Uint8Array {
    const out = new Uint8Array(data.length + 2);
    out.set(data, 0);
    out[data.length] = (sw >> 8) & 0xff;
    out[data.length + 1] = sw & 0xff;
    return out;
  }

  /** Data back from a command: straight away, or, for a T=0 card, announced and collected with GET RESPONSE. */
  #reply(data: Uint8Array): Uint8Array {
    if (this.#options.t0 === true && data.length > 0) {
      this.#pending = data;
      return this.#sw(0x6100 | (data.length & 0xff));
    }
    return this.#sw(SW_OK, data);
  }

  #answer(c: Uint8Array): Uint8Array {
    const [cla, ins, p1, p2] = c;
    // GET RESPONSE
    if (cla === 0x00 && ins === 0xc0) {
      const data = this.#pending ?? new Uint8Array();
      this.#pending = undefined;
      return this.#sw(SW_OK, data);
    }
    // SELECT
    if (cla === 0x00 && ins === 0xa4) {
      const lc = c[4] as number;
      const body = c.subarray(5, 5 + lc);
      if (p1 === 0x04) {
        const isTacho =
          body.length === TACHOGRAPH_AID.length && body.every((b, i) => b === TACHOGRAPH_AID[i]);
        if (!isTacho) return this.#sw(SW_FILE_NOT_FOUND);
        this.#inApplication = true;
        this.#selected = undefined;
        this.#hashed = undefined;
        return this.#sw(SW_OK);
      }
      if (p1 === 0x02) {
        const fid = ((body[0] as number) << 8) | (body[1] as number);
        const file = this.#files.get(fid);
        // The two files at the top of the card are found before the application is selected; the rest only inside it.
        if (file === undefined || file.root === this.#inApplication) {
          return this.#sw(SW_FILE_NOT_FOUND);
        }
        this.#selected = fid;
        this.#hashed = undefined;
        return this.#sw(SW_OK);
      }
      return this.#sw(0x6a86);
    }
    // READ BINARY
    if (cla === 0x00 && ins === 0xb0) {
      const file = this.#selected === undefined ? undefined : this.#files.get(this.#selected);
      if (file === undefined) return this.#sw(0x6986); // no current file
      if ((p1 as number) & 0x80) return this.#sw(0x6a86);
      const offset = (((p1 as number) & 0x7f) << 8) | (p2 as number);
      if (offset > file.data.length) return this.#sw(0x6b00);
      const le = (c[4] as number) === 0 ? 256 : (c[4] as number);
      const data = file.data.subarray(offset, offset + le);
      if (data.length < le) return this.#sw(SW_END_OF_FILE, data);
      return this.#reply(data);
    }
    // PERFORM HASH OF FILE
    if (cla === 0x80 && ins === 0x2a && p1 === 0x90) {
      if (this.#options.refuseSigning === true || this.#selected === undefined) {
        return this.#sw(SW_CONDITIONS_NOT_SATISFIED);
      }
      this.#hashed = this.#selected;
      return this.#sw(SW_OK);
    }
    // PSO: COMPUTE DIGITAL SIGNATURE
    if (cla === 0x00 && ins === 0x2a && p1 === 0x9e && p2 === 0x9a) {
      if (this.#hashed === undefined) return this.#sw(SW_CONDITIONS_NOT_SATISFIED);
      const fid = this.#hashed;
      this.#hashed = undefined;
      return this.#reply(this.signatureFor(fid));
    }
    return this.#sw(0x6d00);
  }

  /** The fake signature the card gives for a file: 128 bytes tied to the file, so a test can see a signature follows its own file. */
  signatureFor(fid: number): Uint8Array {
    return bytesFor(fid + 0x10000, 128);
  }
}
