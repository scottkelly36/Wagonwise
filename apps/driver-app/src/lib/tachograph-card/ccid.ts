import { swText } from './apdu';
import { CardError } from './errors';
import type { CardReader } from './reader';

/**
 * Talking to a USB smart-card reader in the standard way (the USB "CCID" class). The phone's native module only moves raw bytes to
 * and from the reader; everything about what those bytes mean is here, in TypeScript, so it can be tested with no reader and fixed
 * and sent to a test build over the air. Written from the public USB CCID specification (revision 1.1): the messages, the status
 * byte, and the class descriptor. It has NOT yet met a real reader: the first real run is the test.
 */

/** The USB interface class of a smart-card reader. */
export const CCID_INTERFACE_CLASS = 0x0b;

const ICC_POWER_ON = 0x62;
const ICC_POWER_OFF = 0x63;
const GET_SLOT_STATUS = 0x65;
const GET_PARAMETERS = 0x6c;
const XFR_BLOCK = 0x6f;
const DATA_BLOCK = 0x80;
const SLOT_STATUS = 0x81;
const PARAMETERS = 0x82;

const HEADER_LENGTH = 10;

/** Moves raw bytes to and from the reader's two bulk endpoints. The native module is the real one. */
export interface UsbTransport {
  /** Sends bytes to the reader. */
  write(bytes: Uint8Array): Promise<void>;
  /** The next piece the reader sends (one USB transfer, at most). Empty when nothing came in time. */
  read(timeoutMs: number): Promise<Uint8Array>;
}

/** How a reader says it works, from its class descriptor. */
export interface CcidInfo {
  readonly bcdCcid: number;
  readonly maxSlotIndex: number;
  /** Bit 0: 5 V cards, bit 1: 3 V, bit 2: 1.8 V. */
  readonly voltageSupport: number;
  /** Bit 0: T=0 cards, bit 1: T=1 cards. */
  readonly protocols: number;
  readonly features: number;
  readonly maxMessageLength: number;
  /** What the reader takes in a command: a whole command (APDU), the transport frame (TPDU), or single characters (unusable here). */
  readonly level: 'apdu' | 'extended_apdu' | 'tpdu' | 'character';
}

const LEVEL_MASK = 0x00070000;
const AUTOMATIC_VOLTAGE = 0x08;

/** Reads the CCID class descriptor out of a device's raw USB descriptors. `undefined` when there is none. */
export function parseCcidDescriptor(raw: Uint8Array): CcidInfo | undefined {
  let inCcid = false;
  for (let i = 0; i + 2 <= raw.length;) {
    const length = raw[i] as number;
    const type = raw[i + 1] as number;
    if (length < 2) return undefined;
    if (type === 0x04 && length >= 9) {
      inCcid = raw[i + 5] === CCID_INTERFACE_CLASS;
    } else if (type === 0x21 && inCcid && length >= 0x36 && i + length <= raw.length) {
      const u32 = (o: number): number =>
        ((raw[i + o] as number) |
          ((raw[i + o + 1] as number) << 8) |
          ((raw[i + o + 2] as number) << 16) |
          ((raw[i + o + 3] as number) << 24)) >>>
        0;
      const features = u32(40);
      const bits = features & LEVEL_MASK;
      return {
        bcdCcid: (raw[i + 2] as number) | ((raw[i + 3] as number) << 8),
        maxSlotIndex: raw[i + 4] as number,
        voltageSupport: raw[i + 5] as number,
        protocols: u32(6),
        features,
        maxMessageLength: u32(44),
        level:
          bits === 0x10000
            ? 'tpdu'
            : bits === 0x20000
              ? 'apdu'
              : bits === 0x40000
                ? 'extended_apdu'
                : 'character',
      };
    }
    i += length;
  }
  return undefined;
}

/** The protocol a card's answer-to-reset names first: 0 for T=0, 1 for T=1. A card that names none is T=0. */
export function atrProtocol(atr: Uint8Array): number {
  if (atr.length < 2) return 0;
  const y = (atr[1] as number) >> 4;
  let index = 2;
  if (y & 1) index++;
  if (y & 2) index++;
  if (y & 4) index++;
  if (y & 8) return (atr[index] ?? 0) & 0x0f;
  return 0;
}

export function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function message(
  type: number,
  seq: number,
  specific: readonly [number, number, number],
  data: Uint8Array = new Uint8Array(0),
): Uint8Array {
  const out = new Uint8Array(HEADER_LENGTH + data.length);
  out[0] = type;
  out[1] = data.length & 0xff;
  out[2] = (data.length >> 8) & 0xff;
  out[3] = (data.length >> 16) & 0xff;
  out[4] = (data.length >>> 24) & 0xff;
  out[5] = 0; // slot
  out[6] = seq & 0xff;
  out[7] = specific[0];
  out[8] = specific[1];
  out[9] = specific[2];
  out.set(data, HEADER_LENGTH);
  return out;
}

interface Response {
  readonly type: number;
  readonly seq: number;
  /** bmICCStatus: 0 card active, 1 card there but off, 2 no card. */
  readonly iccStatus: number;
  /** bmCommandStatus: 0 done, 1 failed, 2 the reader needs more time. */
  readonly commandStatus: number;
  readonly error: number;
  /** The last header byte: for the parameters answer, the protocol the reader chose (0 for T=0, 1 for T=1). */
  readonly specific: number;
  readonly data: Uint8Array;
}

function messageLength(buffer: Uint8Array): number {
  return (
    HEADER_LENGTH +
    ((buffer[1] as number) |
      ((buffer[2] as number) << 8) |
      ((buffer[3] as number) << 16) |
      (((buffer[4] as number) << 24) >>> 0))
  );
}

export interface CcidOptions {
  /** Where to note what happened, for the test screen's log. Never given the card's data, only sizes and status words. */
  readonly log?: (line: string) => void;
  /** How long to wait for the reader to answer one message. */
  readonly timeoutMs?: number;
}

/** The reader's own wait for a slow card, and how many "still working" answers to put up with before giving up. */
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_WAITS = 30;
const MAX_STRAY_MESSAGES = 5;

const ERROR_NAMES: Readonly<Record<number, string>> = {
  0xfe: 'card silent',
  0xfd: 'parity error',
  0xfc: 'overrun',
  0xfb: 'hardware error',
  0xf7: 'bad answer-to-reset',
  0xf6: 'bad answer-to-reset checksum',
  0x07: 'power select not supported',
  0xf5: 'protocol not supported',
  0xf4: 'class not supported',
  0xf3: 'procedure byte conflict',
  0xf2: 'protocol deactivated',
  0xf0: 'busy with automatic sequence',
};

/**
 * A card reader in the standard USB way, as the download code's `CardReader`. Slot 0 only (a driver-card reader has one slot).
 *
 * How a command goes depends on the reader: one that works at the level of the whole command takes our bytes as they are; one that
 * works at the level of the transport (T=0) wants the five-byte header, so a four-byte command gets a zero length added. Waiting
 * data (`61xx`) and wrong lengths (`6Cxx`) are then handled by the shared `exchange`, as for any T=0 card. A card that talks T=1 to a
 * reader at transport level would need block framing that is not written; that is refused with a clear message, not guessed at.
 */
export class CcidReader implements CardReader {
  readonly #transport: UsbTransport;
  readonly #info: CcidInfo;
  readonly #log: (line: string) => void;
  readonly #timeoutMs: number;
  #seq = 0;

  constructor(transport: UsbTransport, info: CcidInfo, options: CcidOptions = {}) {
    this.#transport = transport;
    this.#info = info;
    this.#log = options.log ?? (() => undefined);
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async powerOn(): Promise<Uint8Array> {
    if (this.#info.level === 'character') {
      throw new CardError('protocol', 'this reader only works one character at a time');
    }
    const status = await this.#send(GET_SLOT_STATUS, [0, 0, 0]);
    if (status.iccStatus === 2) throw new CardError('no_card', 'no card in the reader');
    const atr = await this.#powerOnCard();
    this.#log(
      `card answered: ${atr.length} bytes, first protocol offered T=${atrProtocol(atr)}, reset response ${hex(atr)}`,
    );
    if (this.#info.level === 'tpdu') await this.#checkProtocol();
    return atr;
  }

  async transmit(command: Uint8Array): Promise<Uint8Array> {
    const sent =
      this.#info.level === 'tpdu' && command.length === 4
        ? Uint8Array.from([...command, 0x00])
        : command;
    const response = await this.#send(XFR_BLOCK, [0, 0, 0], sent);
    if (response.data.length < 2) {
      throw new CardError(
        'read_failed',
        `the card gave ${response.data.length} bytes, not a status`,
      );
    }
    const sw =
      ((response.data[response.data.length - 2] as number) << 8) |
      (response.data[response.data.length - 1] as number);
    this.#log(
      `${hex(command.subarray(0, Math.min(command.length, 5)))} -> ${response.data.length - 2} bytes, ${swText(sw)}`,
    );
    return response.data;
  }

  async powerOff(): Promise<void> {
    try {
      await this.#send(ICC_POWER_OFF, [0, 0, 0]);
    } catch {
      // Turning the card off is a courtesy: a reader already unplugged cannot do it.
    }
  }

  /**
   * Turns the card on. A reader that picks the voltage itself is asked to; one that cannot (or whose pick the card ignores) is tried
   * with each voltage it supports, lowest first, so a low-voltage card is never given more than it takes.
   */
  async #powerOnCard(): Promise<Uint8Array> {
    const automatic = (this.#info.features & AUTOMATIC_VOLTAGE) !== 0;
    const explicit = [3, 2, 1].filter(
      (select) => (this.#info.voltageSupport & (1 << (select - 1))) !== 0,
    );
    const tries = [...(automatic || explicit.length === 0 ? [0] : []), ...explicit];
    let last: unknown;
    for (const select of tries) {
      try {
        const response = await this.#send(ICC_POWER_ON, [select, 0, 0]);
        if (response.iccStatus === 2) throw new CardError('no_card', 'no card in the reader');
        return response.data;
      } catch (error) {
        // Only a refused voltage or a silent card is worth trying another voltage for.
        if (!(error instanceof CardError) || !['read_failed', 'protocol'].includes(error.code))
          throw error;
        this.#log(`power on at select ${select} failed: ${error.message}`);
        last = error;
      }
    }
    throw last;
  }

  /**
   * A reader that works at transport level leaves the protocol to us, so ask which one it chose. T=0 is what we speak. If the reader
   * will not say, carry on as T=0 and let the log show how it went.
   */
  async #checkProtocol(): Promise<void> {
    let chosen: number;
    try {
      chosen = (await this.#send(GET_PARAMETERS, [0, 0, 0])).specific;
    } catch (error) {
      if (error instanceof CardError && error.code === 'no_card') throw error;
      this.#log('the reader would not say which protocol it chose; assuming T=0');
      return;
    }
    this.#log(`reader chose protocol T=${chosen}`);
    if (chosen !== 0) {
      throw new CardError('protocol', `the reader chose T=${chosen}, which it leaves to us`);
    }
  }

  async #send(
    type: number,
    specific: readonly [number, number, number],
    data?: Uint8Array,
  ): Promise<Response> {
    const seq = this.#seq++ & 0xff;
    await this.#transport.write(message(type, seq, specific, data));
    for (let waits = 0; waits <= MAX_WAITS;) {
      const response = await this.#receive(seq);
      if (response.commandStatus === 2) {
        waits++;
        continue;
      }
      if (response.commandStatus === 1) throw this.#failure(type, response);
      if (response.iccStatus === 2 && type === XFR_BLOCK) {
        throw new CardError('card_removed', 'the card was taken out');
      }
      return response;
    }
    throw new CardError('read_failed', 'the reader kept saying it needed more time');
  }

  /** Reads one whole message for this sequence number, putting its pieces together and skipping a stray one left from earlier. */
  async #receive(seq: number): Promise<Response> {
    for (let stray = 0; stray <= MAX_STRAY_MESSAGES; stray++) {
      let buffer = new Uint8Array(0);
      while (buffer.length < HEADER_LENGTH || buffer.length < messageLength(buffer)) {
        const chunk = await this.#transport.read(this.#timeoutMs);
        if (chunk.length === 0) throw new CardError('read_failed', 'the reader did not answer');
        const joined = new Uint8Array(buffer.length + chunk.length);
        joined.set(buffer, 0);
        joined.set(chunk, buffer.length);
        buffer = joined;
      }
      const total = messageLength(buffer);
      const type = buffer[0] as number;
      if (
        (type !== DATA_BLOCK && type !== SLOT_STATUS && type !== PARAMETERS) ||
        buffer[6] !== seq
      ) {
        this.#log(
          `skipped a stray message (type ${type.toString(16)}, number ${String(buffer[6])})`,
        );
        continue;
      }
      const status = buffer[7] as number;
      return {
        type,
        seq,
        iccStatus: status & 0x03,
        commandStatus: (status >> 6) & 0x03,
        error: buffer[8] as number,
        specific: buffer[9] as number,
        data: buffer.slice(HEADER_LENGTH, total),
      };
    }
    throw new CardError('protocol', 'the reader sent answers that did not belong to our commands');
  }

  #failure(type: number, response: Response): CardError {
    const name = ERROR_NAMES[response.error] ?? 'error';
    this.#log(
      `reader said failed: ${name} (0x${response.error.toString(16)}), card status ${response.iccStatus}`,
    );
    if (response.iccStatus === 2) {
      return new CardError(
        type === XFR_BLOCK ? 'card_removed' : 'no_card',
        'no card in the reader',
      );
    }
    if (response.error === 0xf5 || response.error === 0xf4) {
      return new CardError('protocol', `the reader says: ${name}`);
    }
    return new CardError('read_failed', `the reader says: ${name}`);
  }
}
