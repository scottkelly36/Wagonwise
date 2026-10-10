import {
  negativeReply,
  NRC,
  parseReadReply,
  readDataByIdentifierReply,
  readDataByIdentifierRequest,
} from './uds';

describe('ReadDataByIdentifier', () => {
  it('asks for a data identifier with service 0x22 and the two identifier bytes', () => {
    expect(Array.from(readDataByIdentifierRequest(0xf90b))).toEqual([0x22, 0xf9, 0x0b]);
    expect(() => readDataByIdentifierRequest(0x10000)).toThrow();
  });

  it('understands a positive reply: service 0x62, the identifier, then the data', () => {
    const reply = readDataByIdentifierReply(0xf90b, Uint8Array.of(1, 2, 3));
    expect(Array.from(reply)).toEqual([0x62, 0xf9, 0x0b, 1, 2, 3]);
    const parsed = parseReadReply(reply, 0xf90b);
    expect(parsed.kind === 'data' && Array.from(parsed.data)).toEqual([1, 2, 3]);
  });

  it('understands a refusal, and tells "still working" from a real refusal', () => {
    expect(parseReadReply(negativeReply(NRC.securityAccessDenied), 1)).toEqual({
      kind: 'refused',
      code: 0x33,
    });
    expect(parseReadReply(negativeReply(NRC.responsePending), 1)).toEqual({ kind: 'pending' });
  });

  it('does not trust a reply for something else, or a malformed one', () => {
    expect(parseReadReply(readDataByIdentifierReply(0x0002, Uint8Array.of(1)), 0x0001).kind).toBe(
      'unexpected',
    );
    expect(parseReadReply(new Uint8Array(), 1).kind).toBe('unexpected');
    expect(parseReadReply(Uint8Array.of(0x7f, 0x22), 1).kind).toBe('unexpected');
    expect(parseReadReply(Uint8Array.of(0x7f, 0x10, 0x31), 1).kind).toBe('unexpected');
    expect(parseReadReply(Uint8Array.of(0x50, 0, 1), 1).kind).toBe('unexpected');
    expect(parseReadReply(Uint8Array.of(0x62, 0), 1).kind).toBe('unexpected');
  });
});
