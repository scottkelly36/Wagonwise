import { shortDistance, spokenDistance } from './uk-distance';

const yards = (n: number) => n * 0.9144;
const miles = (n: number) => n * 1609.344;

describe('spokenDistance', () => {
  it('says yards to the nearest 50 for short distances', () => {
    expect(spokenDistance(yards(300), 'miles')).toBe('300 yards');
    expect(spokenDistance(yards(320), 'miles')).toBe('300 yards');
    expect(spokenDistance(yards(330), 'miles')).toBe('350 yards');
    expect(spokenDistance(yards(560), 'miles')).toBe('550 yards');
  });

  it('never says less than 50 yards', () => {
    expect(spokenDistance(yards(10), 'miles')).toBe('50 yards');
  });

  it('says miles in quarters once it is about half a mile', () => {
    expect(spokenDistance(miles(0.5), 'miles')).toBe('half a mile');
    expect(spokenDistance(miles(0.27), 'miles')).not.toContain('mile'); // still yards at 475 yards
    expect(spokenDistance(miles(0.3), 'miles')).toBe('550 yards'); // 528 yd, under the 800 yd cut-over
    expect(spokenDistance(miles(0.46), 'miles')).toBe('half a mile');
    expect(spokenDistance(miles(0.75), 'miles')).toBe('three quarters of a mile');
    expect(spokenDistance(miles(1), 'miles')).toBe('1 mile');
    expect(spokenDistance(miles(1.5), 'miles')).toBe('1 and a half miles');
  });

  it('says whole miles for longer distances', () => {
    expect(spokenDistance(miles(2), 'miles')).toBe('2 miles');
    expect(spokenDistance(miles(2.4), 'miles')).toBe('2 miles');
    expect(spokenDistance(miles(12.6), 'miles')).toBe('13 miles');
  });

  it('never uses feet or metres', () => {
    for (const m of [30, 90, 250, 700, 1200, 5000, 40000]) {
      expect(spokenDistance(m, 'miles')).not.toMatch(/feet|foot|metre|kilomet/i);
    }
  });
});

describe('shortDistance', () => {
  it('shows yards to the nearest 10, then 50, for the turn card', () => {
    expect(shortDistance(yards(83), 'miles')).toBe('80 yd');
    expect(shortDistance(yards(300), 'miles')).toBe('300 yd');
    expect(shortDistance(yards(430), 'miles')).toBe('450 yd');
  });

  it('never shows less than 10 yards', () => {
    expect(shortDistance(2, 'miles')).toBe('10 yd');
  });

  it('shows miles to a decimal, and whole miles from 10', () => {
    expect(shortDistance(miles(0.6), 'miles')).toBe('0.6 mi');
    expect(shortDistance(miles(1.25), 'miles')).toBe('1.3 mi');
    expect(shortDistance(miles(9.94), 'miles')).toBe('9.9 mi');
    expect(shortDistance(miles(12.4), 'miles')).toBe('12 mi');
  });
});

describe('in kilometres', () => {
  it('says metres to the nearest 50, never less than 50', () => {
    expect(spokenDistance(300, 'km')).toBe('300 metres');
    expect(spokenDistance(320, 'km')).toBe('300 metres');
    expect(spokenDistance(330, 'km')).toBe('350 metres');
    expect(spokenDistance(10, 'km')).toBe('50 metres');
  });

  it('says kilometres in halves, then whole, and never rounds metres up to "1000 metres"', () => {
    expect(spokenDistance(949, 'km')).toBe('950 metres');
    expect(spokenDistance(975, 'km')).toBe('1 kilometre');
    expect(spokenDistance(1000, 'km')).toBe('1 kilometre');
    expect(spokenDistance(1500, 'km')).toBe('1.5 kilometres');
    expect(spokenDistance(2000, 'km')).toBe('2 kilometres');
    expect(spokenDistance(4800, 'km')).toBe('5 kilometres');
    expect(spokenDistance(12600, 'km')).toBe('13 kilometres');
  });

  it('never says yards, miles or feet', () => {
    for (const m of [30, 300, 800, 1200, 5000, 20000]) {
      expect(spokenDistance(m, 'km')).not.toMatch(/yard|mile|feet|foot/i);
    }
  });

  it('shows metres on the turn card to the nearest 10 (50 from 200), then kilometres to a tenth', () => {
    expect(shortDistance(83, 'km')).toBe('80 m');
    expect(shortDistance(2, 'km')).toBe('10 m');
    expect(shortDistance(430, 'km')).toBe('450 m');
    expect(shortDistance(990, 'km')).toBe('1000 m');
    expect(shortDistance(1000, 'km')).toBe('1.0 km');
    expect(shortDistance(1260, 'km')).toBe('1.3 km');
    expect(shortDistance(9940, 'km')).toBe('9.9 km');
    expect(shortDistance(12400, 'km')).toBe('12 km');
  });
});
