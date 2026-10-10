import {
  DEFAULT_ATT_MTU,
  encodeMessage,
  ITS_SERVICES,
  MAX_PACKETS_PER_MESSAGE,
  MessageAssembler,
  payloadPerPacket,
} from './transport';

const bytes = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => i % 251);

describe('the service identifiers', () => {
  it('are the ones in the transport protocol', () => {
    expect(ITS_SERVICES.download.service).toBe('eef90782-55dd-4388-b80b-695aba7a69b5');
    expect(ITS_SERVICES.download.fifo).toBe('29d3a479-1592-47df-80a4-afa742d369bb');
    expect(ITS_SERVICES.download.credits).toBe('db9c4128-bff3-41fe-a306-fb6f9a8aeb2d');
    expect(ITS_SERVICES.diagnostics.service).toBe('fa213def-aef4-475c-bcea-0a8d69073efc');
    expect(ITS_SERVICES.diagnostics.fifo).toBe('e413960c-75ba-4ca9-8a67-99bc052a1b13');
    expect(ITS_SERVICES.diagnostics.credits).toBe('e168d1a6-304f-42b4-ab96-4cd1d4efebd9');
  });
});

describe('encodeMessage', () => {
  it('puts the packet count and number 1 on the first packet and 0 and the number on the rest', () => {
    // MTU 23 leaves 18 bytes of data in a packet (23 less 3 for ATT and 2 for the packet information).
    expect(payloadPerPacket(DEFAULT_ATT_MTU)).toBe(18);
    const packets = encodeMessage(bytes(40), DEFAULT_ATT_MTU);
    expect(packets.map((p) => [p[0], p[1], p.length - 2])).toEqual([
      [3, 1, 18],
      [0, 2, 18],
      [0, 3, 4],
    ]);
  });

  it('sends a message that fits as one packet, and an empty one as one empty packet', () => {
    expect(encodeMessage(bytes(18)).map((p) => Array.from(p.subarray(0, 2)))).toEqual([[1, 1]]);
    const empty = encodeMessage(new Uint8Array());
    expect(empty).toHaveLength(1);
    expect(Array.from(empty[0] as Uint8Array)).toEqual([1, 1]);
  });

  it('uses a bigger packet once a bigger MTU is agreed', () => {
    expect(encodeMessage(bytes(100), 247)).toHaveLength(1);
    expect(payloadPerPacket(247)).toBe(242);
  });

  it('refuses a message too long for the packet count, and an MTU too small to carry data', () => {
    expect(() => encodeMessage(bytes(18 * MAX_PACKETS_PER_MESSAGE + 1))).toThrow(
      /needs 256 packets/,
    );
    expect(() => payloadPerPacket(5)).toThrow(/too small/);
  });
});

describe('MessageAssembler', () => {
  it('puts a message back together from its packets', () => {
    const message = bytes(100);
    const assembler = new MessageAssembler();
    const results = encodeMessage(message, 23).map((p) => assembler.feed(p));
    const last = results.at(-1);
    expect(results.slice(0, -1).every((r) => r.kind === 'partial')).toBe(true);
    expect(last?.kind).toBe('message');
    expect(last?.kind === 'message' && Array.from(last.message)).toEqual(Array.from(message));
  });

  it('reports progress, and can take a second message straight after the first', () => {
    const assembler = new MessageAssembler();
    const [a, b] = encodeMessage(bytes(30), 23) as [Uint8Array, Uint8Array];
    expect(assembler.feed(a)).toEqual({ kind: 'partial', received: 1, total: 2 });
    expect(assembler.feed(b).kind).toBe('message');
    expect(assembler.feed(encodeMessage(Uint8Array.of(9))[0] as Uint8Array)).toEqual({
      kind: 'message',
      message: Uint8Array.of(9),
    });
  });

  it('drops a half-received message when the sender starts another', () => {
    const assembler = new MessageAssembler();
    assembler.feed(encodeMessage(bytes(40))[0] as Uint8Array);
    const fresh = assembler.feed(encodeMessage(Uint8Array.of(1, 2, 3))[0] as Uint8Array);
    expect(fresh).toEqual({ kind: 'message', message: Uint8Array.of(1, 2, 3) });
  });

  it('says so when a packet is missing, a continuation arrives with no start, or a packet is too short', () => {
    const assembler = new MessageAssembler();
    const packets = encodeMessage(bytes(60), 23);
    assembler.feed(packets[0] as Uint8Array);
    expect(assembler.feed(packets[2] as Uint8Array)).toEqual({
      kind: 'error',
      reason: 'out_of_order',
    });
    // The message was dropped, so the next continuation has nothing to join.
    expect(assembler.feed(packets[1] as Uint8Array)).toEqual({
      kind: 'error',
      reason: 'unexpected_continuation',
    });
    expect(assembler.feed(Uint8Array.of(1))).toEqual({ kind: 'error', reason: 'too_short' });
    // A "first" packet that is not number 1 is a fault.
    expect(assembler.feed(Uint8Array.of(2, 2, 0))).toEqual({
      kind: 'error',
      reason: 'out_of_order',
    });
  });
});
