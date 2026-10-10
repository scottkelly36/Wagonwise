import { CREDITS_END, creditsValue, parseCredits, ReceiveWindow, SendCredits } from './credits';

describe('the credits value', () => {
  it('is a number of packets, or 0xFF to refuse or end a connection', () => {
    expect(parseCredits(Uint8Array.of(16))).toEqual({ kind: 'grant', credits: 16 });
    expect(parseCredits(Uint8Array.of(0))).toEqual({ kind: 'grant', credits: 0 });
    expect(parseCredits(Uint8Array.of(CREDITS_END))).toEqual({ kind: 'reject' });
    expect(() => parseCredits(Uint8Array.of(1, 2))).toThrow(/one byte/);
  });

  it('is written as one byte, never the end marker', () => {
    expect(Array.from(creditsValue(8))).toEqual([8]);
    expect(() => creditsValue(255)).toThrow();
    expect(() => creditsValue(-1)).toThrow();
    expect(() => creditsValue(1.5)).toThrow();
  });
});

describe('SendCredits', () => {
  it('adds what is granted to what is left, and spends them one by one', () => {
    const credits = new SendCredits();
    expect(credits.tryTake()).toBe(false);
    credits.grant(2);
    credits.grant(1);
    expect(credits.available).toBe(3);
    expect(credits.tryTake()).toBe(true);
    expect(credits.available).toBe(2);
  });

  it('spends a whole message’s credits together or none, so a message is never half sent', () => {
    const credits = new SendCredits();
    credits.grant(3);
    expect(credits.tryTakeAll(4)).toBe(false);
    expect(credits.available).toBe(3);
    expect(credits.tryTakeAll(3)).toBe(true);
    expect(credits.available).toBe(0);
  });

  it('forgets everything on reset', () => {
    const credits = new SendCredits();
    credits.grant(5);
    credits.reset();
    expect(credits.available).toBe(0);
  });
});

describe('ReceiveWindow', () => {
  it('gives the whole window at the start, then more once it runs low', () => {
    const window = new ReceiveWindow(8, 4);
    expect(window.open()).toBe(8);
    // 7, 6, 5, 4 left: still enough.
    for (let i = 0; i < 4; i += 1) expect(window.onPacket()).toBe(0);
    // The fifth packet leaves 3: top up to 8.
    expect(window.onPacket()).toBe(5);
    expect(window.onPacket()).toBe(0);
  });

  it('refuses a window that cannot work', () => {
    expect(() => new ReceiveWindow(0)).toThrow();
    expect(() => new ReceiveWindow(255)).toThrow();
  });
});
