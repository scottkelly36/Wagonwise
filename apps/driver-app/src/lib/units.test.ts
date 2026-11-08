import {
  feetInchesToMetres,
  formatHeightWithFeetInches,
  metresToFeetInches,
  metresToFeetInchesBoxes,
} from './units';

describe('feetInchesToMetres', () => {
  it('converts feet and inches to metres as text', () => {
    expect(feetInchesToMetres('13', '6')).toBe('4.1148');
    expect(feetInchesToMetres('8', '6')).toBe('2.5908');
  });

  it('takes feet alone or inches alone', () => {
    expect(feetInchesToMetres('13', '')).toBe('3.9624');
    expect(feetInchesToMetres('', '6')).toBe('0.1524');
  });

  it('gives an empty answer when both boxes are empty, and an invalid one for rubbish or a negative', () => {
    expect(feetInchesToMetres('', '')).toBe('');
    expect(feetInchesToMetres(' ', ' ')).toBe('');
    expect(feetInchesToMetres('abc', '6')).toBe('NaN');
    expect(feetInchesToMetres('13', '-2')).toBe('NaN');
  });
});

describe('metresToFeetInchesBoxes', () => {
  it('fills the two boxes from metres', () => {
    expect(metresToFeetInchesBoxes('4.1148')).toEqual({ feet: '13', inches: '6' });
    expect(metresToFeetInchesBoxes('2.5908')).toEqual({ feet: '8', inches: '6' });
  });

  it('rounds up to the next whole inch, never down (never shows a vehicle smaller than it is)', () => {
    // 4.2 m is 13 ft 9.4 in.
    expect(metresToFeetInchesBoxes('4.2')).toEqual({ feet: '13', inches: '10' });
  });

  it('survives a round trip from feet and inches', () => {
    expect(metresToFeetInchesBoxes(feetInchesToMetres('13', '6'))).toEqual({
      feet: '13',
      inches: '6',
    });
  });

  it('gives empty boxes for nothing or something that is not a positive number', () => {
    expect(metresToFeetInchesBoxes('')).toEqual({ feet: '', inches: '' });
    expect(metresToFeetInchesBoxes('NaN')).toEqual({ feet: '', inches: '' });
    expect(metresToFeetInchesBoxes('0')).toEqual({ feet: '', inches: '' });
  });
});

describe('metresToFeetInches', () => {
  it('converts a round number of metres', () => {
    expect(metresToFeetInches(3)).toBe('9\'10"');
  });

  it("matches the design doc's own worked example (3.5m)", () => {
    // 3.5m is the exact bridge height used in AGENTS.md/the tech design's applies() example.
    expect(metresToFeetInches(3.5)).toBe('11\'6"');
  });

  it('rounds to the nearest whole inch', () => {
    expect(metresToFeetInches(1.83)).toBe('6\'0"');
  });
});

describe('formatHeightWithFeetInches', () => {
  it('shows metres alongside the feet/inches conversion', () => {
    expect(formatHeightWithFeetInches(3.5)).toBe('3.5m (11\'6")');
  });

  it('shows nothing for an unset value', () => {
    expect(formatHeightWithFeetInches(undefined)).toBe('');
  });

  it('shows nothing for a non-positive or non-finite value', () => {
    expect(formatHeightWithFeetInches(0)).toBe('');
    expect(formatHeightWithFeetInches(-1)).toBe('');
    expect(formatHeightWithFeetInches(Number.NaN)).toBe('');
  });
});
