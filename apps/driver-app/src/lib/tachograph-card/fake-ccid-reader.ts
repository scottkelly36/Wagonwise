import { getResponse, SW1_MORE_DATA, SW1_WRONG_LE, splitResponse } from './apdu';
import type { UsbTransport } from './ccid';
import type { CardReader } from './reader';

/** A device's raw descriptors with one smart-card interface, built to the layout the USB CCID specification gives. */
export function fakeDescriptors(features: number, protocols = 3): Uint8Array {
  const device = [18, 1, 0x00, 0x02, 0, 0, 0, 64, 0x6a, 0x07, 0x01, 0x30, 0, 1, 1, 2, 0, 1];
  const config = [9, 2, 0, 0, 1, 1, 0, 0x80, 50];
  const iface = [9, 4, 0, 0, 3, 0x0b, 0, 0, 0];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
  const ccid = [
    0x36,
    0x21,
    0x10,
    0x01,
    0,
    0x07,
    ...u32(protocols),
    ...u32(4000),
    ...u32(4000),
    0,
    ...u32(10752),
    ...u32(344086),
    0,
    ...u32(254),
    ...u32(0),
    ...u32(0),
    ...u32(features),
    ...u32(271),
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ];
  const endpoints = [7, 5, 0x81, 2, 64, 0, 0, 7, 5, 0x02, 2, 64, 0, 0, 7, 5, 0x83, 3, 8, 0, 16];
  return Uint8Array.from([...device, ...config, ...iface, ...ccid, ...endpoints]);
}

export interface FakeCcidOptions {
  /** What the reader takes: whole commands (`apdu`) or the transport frame (`tpdu`). */
  readonly level?: 'apdu' | 'tpdu';
  /** The most bytes one USB transfer carries; longer messages arrive in pieces. A real reader's is 64 or 512. */
  readonly packetSize?: number;
  /** How many "still working" answers to give before each real one. */
  readonly extensions?: number;
  /** The protocol the reader says it chose when asked (GetParameters). */
  readonly protocol?: 0 | 1;
  /** A reader that does not understand GetParameters. */
  readonly noGetParameters?: boolean;
  /** The first message the reader sends is one left over from an earlier command. */
  readonly strayFirst?: boolean;
  /** The reader never answers. */
  readonly silent?: boolean;
  /** No card in the reader: the slot says so. */
  readonly noCard?: boolean;
}

/**
 * A pretend USB card reader: takes the same bytes a real one would on its bulk endpoints and answers as a standard reader does, with a
 * `CardReader` (the simulated card) behind it. It lets the whole path from the download down to the USB messages run in a test. It is
 * written from the same specification as the code it tests, so it can only catch mistakes of ours, not a misreading of the standard
 * or the quirks of a particular reader.
 */
export class FakeCcidReader implements UsbTransport {
  /** Every message written to the reader, so a test can see the exact bytes. */
  readonly written: Uint8Array[] = [];
  readonly #card: CardReader;
  readonly #options: FakeCcidOptions;
  #out: Uint8Array[] = [];
  #powered = false;

  constructor(card: CardReader, options: FakeCcidOptions = {}) {
    this.#card = card;
    this.#options = options;
    if (options.strayFirst === true) this.#queue(this.#reply(0x81, 99, 0, 0, 0));
  }

  async write(bytes: Uint8Array): Promise<void> {
    this.written.push(bytes);
    if (this.#options.silent === true) return;
    const type = bytes[0] as number;
    const seq = bytes[6] as number;
    const length = (bytes[1] as number) | ((bytes[2] as number) << 8);
    const data = bytes.slice(10, 10 + length);
    for (let i = 0; i < (this.#options.extensions ?? 0); i++) {
      this.#queue(this.#reply(type === 0x62 || type === 0x6f ? 0x80 : 0x81, seq, 0x80, 0, 0));
    }
    switch (type) {
      case 0x65: // GetSlotStatus
        this.#queue(this.#reply(0x81, seq, this.#iccStatus(), 0, 0));
        return;
      case 0x62: {
        // IccPowerOn
        try {
          const atr = await this.#card.powerOn();
          this.#powered = true;
          this.#queue(this.#reply(0x80, seq, 0, 0, 0, atr));
        } catch {
          this.#queue(this.#reply(0x80, seq, 0x40 | 2, 0xfe, 0));
        }
        return;
      }
      case 0x63: // IccPowerOff
        this.#powered = false;
        await this.#card.powerOff();
        this.#queue(this.#reply(0x81, seq, 1, 0, 0));
        return;
      case 0x6c: // GetParameters
        if (this.#options.noGetParameters === true) {
          this.#queue(this.#reply(0x82, seq, 0x40, 0x00, 0));
        } else {
          this.#queue(this.#reply(0x82, seq, 0, 0, this.#options.protocol ?? 0));
        }
        return;
      case 0x6f: {
        // XfrBlock
        if (!this.#powered) {
          this.#queue(this.#reply(0x80, seq, 0x40 | 1, 0xfe, 0));
          return;
        }
        if (this.#options.level === 'tpdu' && data.length < 5) {
          // A transport-level reader cannot take a four-byte command: it has no length byte to send.
          this.#queue(this.#reply(0x80, seq, 0x40, 0x01, 0));
          return;
        }
        try {
          this.#queue(this.#reply(0x80, seq, 0, 0, 0, await this.#run(data)));
        } catch {
          this.#queue(this.#reply(0x80, seq, 0x40 | 2, 0xfe, 0));
        }
        return;
      }
    }
  }

  async read(): Promise<Uint8Array> {
    return this.#out.shift() ?? new Uint8Array(0);
  }

  #iccStatus(): number {
    if (this.#options.noCard === true) return 2;
    return this.#powered ? 0 : 1;
  }

  /** An apdu-level reader finishes what a T=0 card leaves undone; a transport-level one hands it back. */
  async #run(command: Uint8Array): Promise<Uint8Array> {
    let raw = await this.#card.transmit(command);
    if (this.#options.level === 'tpdu') return raw;
    let response = splitResponse(raw);
    if (response.sw >> 8 === SW1_WRONG_LE && command.length === 5) {
      const retry = Uint8Array.from(command);
      retry[4] = response.sw & 0xff;
      raw = await this.#card.transmit(retry);
      response = splitResponse(raw);
    }
    if (response.sw >> 8 === SW1_MORE_DATA) {
      return this.#card.transmit(getResponse(response.sw & 0xff));
    }
    return raw;
  }

  #reply(
    type: number,
    seq: number,
    status: number,
    error: number,
    specific: number,
    data: Uint8Array = new Uint8Array(0),
  ): Uint8Array {
    const out = new Uint8Array(10 + data.length);
    out[0] = type;
    out[1] = data.length & 0xff;
    out[2] = (data.length >> 8) & 0xff;
    out[6] = seq;
    out[7] = status;
    out[8] = error;
    out[9] = specific;
    out.set(data, 10);
    return out;
  }

  /** Puts a message on the way out in pieces of the packet size. */
  #queue(message: Uint8Array): void {
    const size = this.#options.packetSize ?? 64;
    for (let i = 0; i < message.length; i += size) {
      this.#out.push(message.slice(i, i + size));
    }
  }
}
