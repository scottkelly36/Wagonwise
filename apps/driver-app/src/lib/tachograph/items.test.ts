import { decodeItem, encodeItem, ITEM_NAMES } from './items';

describe('the working state', () => {
  it('reads rest, availability, work and driving, and nothing for an error or "not available"', () => {
    expect(decodeItem('workingState', Uint8Array.of(0))).toBe('rest');
    expect(decodeItem('workingState', Uint8Array.of(1))).toBe('available');
    expect(decodeItem('workingState', Uint8Array.of(2))).toBe('work');
    expect(decodeItem('workingState', Uint8Array.of(3))).toBe('drive');
    expect(decodeItem('workingState', Uint8Array.of(6))).toBeUndefined();
    expect(decodeItem('workingState', Uint8Array.of(7))).toBeUndefined();
    expect(decodeItem('workingState', new Uint8Array())).toBeUndefined();
  });

  it('ignores bits that are not the state', () => {
    expect(decodeItem('workingState', Uint8Array.of(0b1111_1011))).toBe('drive');
  });
});

describe('a time item', () => {
  it('is whole minutes in two bytes, most significant first', () => {
    expect(decodeItem('continuousDrivingTime', Uint8Array.of(0x01, 0x0e))).toBe(270);
    expect(decodeItem('cumulativeBreakTime', Uint8Array.of(0, 0))).toBe(0);
  });

  it('is nothing at all when the unit says not available or error, and for too few bytes', () => {
    expect(decodeItem('continuousDrivingTime', Uint8Array.of(0xff, 0xff))).toBeUndefined();
    expect(decodeItem('continuousDrivingTime', Uint8Array.of(0xfe, 0x00))).toBeUndefined();
    expect(decodeItem('continuousDrivingTime', Uint8Array.of(0x01))).toBeUndefined();
  });
});

describe('encodeItem', () => {
  it('is the inverse of decodeItem for every item', () => {
    for (const name of ITEM_NAMES) {
      const value = name === 'workingState' ? 'drive' : 1234;
      expect(decodeItem(name, encodeItem(name, value))).toBe(value);
    }
  });

  it('writes a missing value as not available, and refuses a time that does not fit', () => {
    expect(
      decodeItem('continuousDrivingTime', encodeItem('continuousDrivingTime', undefined)),
    ).toBeUndefined();
    expect(decodeItem('workingState', encodeItem('workingState', undefined))).toBeUndefined();
    expect(() => encodeItem('continuousDrivingTime', -1)).toThrow();
    expect(() => encodeItem('continuousDrivingTime', 70_000)).toThrow();
  });
});
