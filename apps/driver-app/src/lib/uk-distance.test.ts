import { shortDistance, spokenDistance } from './uk-distance';

const yards = (n: number) => n * 0.9144;
const miles = (n: number) => n * 1609.344;

describe('spokenDistance', () => {
  it('says yards to the nearest 50 for short distances', () => {
    expect(spokenDistance(yards(300))).toBe('300 yards');
    expect(spokenDistance(yards(320))).toBe('300 yards');
    expect(spokenDistance(yards(330))).toBe('350 yards');
    expect(spokenDistance(yards(560))).toBe('550 yards');
  });

  it('never says less than 50 yards', () => {
    expect(spokenDistance(yards(10))).toBe('50 yards');
  });

  it('says miles in quarters once it is about half a mile', () => {
    expect(spokenDistance(miles(0.5))).toBe('half a mile');
    expect(spokenDistance(miles(0.27))).not.toContain('mile'); // still yards at 475 yards
    expect(spokenDistance(miles(0.3))).toBe('550 yards'); // 528 yd, under the 800 yd cut-over
    expect(spokenDistance(miles(0.46))).toBe('half a mile');
    expect(spokenDistance(miles(0.75))).toBe('three quarters of a mile');
    expect(spokenDistance(miles(1))).toBe('1 mile');
    expect(spokenDistance(miles(1.5))).toBe('1 and a half miles');
  });

  it('says whole miles for longer distances', () => {
    expect(spokenDistance(miles(2))).toBe('2 miles');
    expect(spokenDistance(miles(2.4))).toBe('2 miles');
    expect(spokenDistance(miles(12.6))).toBe('13 miles');
  });

  it('never uses feet or metres', () => {
    for (const m of [30, 90, 250, 700, 1200, 5000, 40000]) {
      expect(spokenDistance(m)).not.toMatch(/feet|foot|metre|kilomet/i);
    }
  });
});

describe('shortDistance', () => {
  it('shows yards to the nearest 10, then 50, for the turn card', () => {
    expect(shortDistance(yards(83))).toBe('80 yd');
    expect(shortDistance(yards(300))).toBe('300 yd');
    expect(shortDistance(yards(430))).toBe('450 yd');
  });

  it('never shows less than 10 yards', () => {
    expect(shortDistance(2)).toBe('10 yd');
  });

  it('shows miles to a decimal, and whole miles from 10', () => {
    expect(shortDistance(miles(0.6))).toBe('0.6 mi');
    expect(shortDistance(miles(1.25))).toBe('1.3 mi');
    expect(shortDistance(miles(9.94))).toBe('9.9 mi');
    expect(shortDistance(miles(12.4))).toBe('12 mi');
  });
});
