/**
 * The smart tachograph V2's Bluetooth Low Energy "serial port" transport, as specified in the industry working group's
 * "Smart Tachograph V2: Transport protocol for ITS", version 1.0 (28.10.2021), and Appendix 13 of Regulation (EU) 2021/1228.
 * Pure: no Bluetooth library in here, so it can be tested without a lorry. The phone (the "central", the ITS unit) talks to the
 * tachograph (the "peripheral", the server) through two GATT services, Download and Diagnostics, each with a FIFO characteristic
 * (the phone writes, the unit indicates) and a Credits characteristic (flow control).
 */

/** GATT service and characteristic identifiers, from section 4.3 of the transport protocol. */
export const ITS_SERVICES = {
  download: {
    service: 'eef90782-55dd-4388-b80b-695aba7a69b5',
    fifo: '29d3a479-1592-47df-80a4-afa742d369bb',
    credits: 'db9c4128-bff3-41fe-a306-fb6f9a8aeb2d',
  },
  diagnostics: {
    service: 'fa213def-aef4-475c-bcea-0a8d69073efc',
    fifo: 'e413960c-75ba-4ca9-8a67-99bc052a1b13',
    credits: 'e168d1a6-304f-42b4-ab96-4cd1d4efebd9',
  },
} as const;

/** The smallest ATT MTU Bluetooth LE allows, and what is used until a larger one is agreed. */
export const DEFAULT_ATT_MTU = 23;
/** An ATT write or indication spends 3 bytes on its own header. */
const ATT_HEADER = 3;
/** Each packet starts with two bytes saying how many packets the message has (first packet only) and which one this is. */
const PACKET_INFO = 2;
/** Both counts are a single byte. */
export const MAX_PACKETS_PER_MESSAGE = 255;

/** How many bytes of a message fit in one packet at this ATT MTU. */
export function payloadPerPacket(attMtu: number): number {
  const size = attMtu - ATT_HEADER - PACKET_INFO;
  if (!Number.isInteger(size) || size < 1)
    throw new Error(`ATT MTU ${attMtu} is too small to carry data`);
  return size;
}

/**
 * Splits one application message into packets (section 4.6.4). The first packet starts with the total number of packets and
 * packet number 1 (`AA 01`); each later packet starts with 0 and its number (`00 02`, `00 03`...). An empty message is one packet.
 */
export function encodeMessage(message: Uint8Array, attMtu: number = DEFAULT_ATT_MTU): Uint8Array[] {
  const size = payloadPerPacket(attMtu);
  const total = Math.max(1, Math.ceil(message.length / size));
  if (total > MAX_PACKETS_PER_MESSAGE) {
    throw new Error(
      `A message of ${message.length} bytes needs ${total} packets at MTU ${attMtu}; the most is ${MAX_PACKETS_PER_MESSAGE}`,
    );
  }
  const packets: Uint8Array[] = [];
  for (let n = 1; n <= total; n += 1) {
    const chunk = message.subarray((n - 1) * size, n * size);
    const packet = new Uint8Array(PACKET_INFO + chunk.length);
    packet[0] = n === 1 ? total : 0;
    packet[1] = n;
    packet.set(chunk, PACKET_INFO);
    packets.push(packet);
  }
  return packets;
}

export type AssemblerResult =
  | { readonly kind: 'partial'; readonly received: number; readonly total: number }
  | { readonly kind: 'message'; readonly message: Uint8Array }
  | {
      readonly kind: 'error';
      readonly reason: 'too_short' | 'out_of_order' | 'unexpected_continuation';
    };

/**
 * Puts the packets of a message back together. A packet starting a new message while another is half-received drops the old one
 * (the sender gave up on it); a packet out of order drops the message and says so, so the caller can ask again.
 */
export class MessageAssembler {
  #total = 0;
  #received = 0;
  #parts: Uint8Array[] = [];

  feed(packet: Uint8Array): AssemblerResult {
    if (packet.length < PACKET_INFO) return this.#fail('too_short');
    const first = packet[0] as number;
    const number = packet[1] as number;
    if (first !== 0) {
      // The first packet of a message: AA is the total, and this is packet 1.
      this.#reset();
      if (number !== 1) return this.#fail('out_of_order');
      this.#total = first;
    } else if (this.#total === 0) {
      return this.#fail('unexpected_continuation');
    } else if (number !== this.#received + 1) {
      return this.#fail('out_of_order');
    }
    this.#parts.push(packet.subarray(PACKET_INFO));
    this.#received += 1;
    if (this.#received < this.#total)
      return { kind: 'partial', received: this.#received, total: this.#total };
    const length = this.#parts.reduce((sum, p) => sum + p.length, 0);
    const message = new Uint8Array(length);
    let at = 0;
    for (const part of this.#parts) {
      message.set(part, at);
      at += part.length;
    }
    this.#reset();
    return { kind: 'message', message };
  }

  #fail(reason: 'too_short' | 'out_of_order' | 'unexpected_continuation'): AssemblerResult {
    this.#reset();
    return { kind: 'error', reason };
  }

  #reset(): void {
    this.#total = 0;
    this.#received = 0;
    this.#parts = [];
  }
}
