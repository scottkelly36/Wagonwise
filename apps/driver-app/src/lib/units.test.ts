import { formatHeightWithFeetInches, metresToFeetInches } from './units';

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
