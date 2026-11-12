import { describe, expect, it } from 'vitest';
import { euroVIFromChoice, topSpeedKphFromMph } from './vehicle-speed';

describe('topSpeedKphFromMph', () => {
  it('turns miles per hour into the kilometres per hour core stores', () => {
    expect(topSpeedKphFromMph('56')).toEqual({ ok: true, kph: 90.1 });
    expect(topSpeedKphFromMph(' 60 ')).toEqual({ ok: true, kph: 96.6 });
  });

  it('accepts a blank, which means the usual speed', () => {
    expect(topSpeedKphFromMph('')).toEqual({ ok: true, kph: undefined });
    expect(topSpeedKphFromMph('   ')).toEqual({ ok: true, kph: undefined });
  });

  it('refuses a figure that is not a speed a lorry could be set to', () => {
    for (const text of ['abc', '5', '18', '81', '200']) {
      expect(topSpeedKphFromMph(text)).toMatchObject({ ok: false });
    }
    expect(topSpeedKphFromMph('19')).toMatchObject({ ok: true });
    expect(topSpeedKphFromMph('80')).toMatchObject({ ok: true });
  });
});

describe('euroVIFromChoice', () => {
  it('keeps "Not stated" as absent, and no as false rather than absent', () => {
    expect(euroVIFromChoice('')).toBeUndefined();
    expect(euroVIFromChoice('yes')).toBe(true);
    expect(euroVIFromChoice('no')).toBe(false);
  });
});
