import { hazardSeverityFor, measurementKindFor, measurementUnitFor } from './hazard-labels';

describe('measurementKindFor', () => {
  it('maps the three measured restriction types to their kind', () => {
    expect(measurementKindFor('low_bridge')).toBe('height');
    expect(measurementKindFor('weight_limit')).toBe('weight');
    expect(measurementKindFor('width_restriction')).toBe('width');
  });

  it('returns undefined for a type with nothing to measure', () => {
    expect(measurementKindFor('tight_bend')).toBeUndefined();
    expect(measurementKindFor('roadworks')).toBeUndefined();
    expect(measurementKindFor('flooding')).toBeUndefined();
    expect(measurementKindFor('no_hgv')).toBeUndefined();
    expect(measurementKindFor('other')).toBeUndefined();
  });
});

describe('measurementUnitFor', () => {
  it('maps height/width to metres and weight to tonnes', () => {
    expect(measurementUnitFor('height')).toBe('m');
    expect(measurementUnitFor('width')).toBe('m');
    expect(measurementUnitFor('weight')).toBe('t');
  });
});

describe('hazardSeverityFor', () => {
  it("rates a vehicle genuinely can't-pass restriction as high", () => {
    expect(hazardSeverityFor('low_bridge')).toBe('high');
    expect(hazardSeverityFor('weight_limit')).toBe('high');
    expect(hazardSeverityFor('width_restriction')).toBe('high');
    expect(hazardSeverityFor('no_hgv')).toBe('high');
  });

  it('rates a take-care hazard as caution', () => {
    expect(hazardSeverityFor('tight_bend')).toBe('caution');
    expect(hazardSeverityFor('roadworks')).toBe('caution');
    expect(hazardSeverityFor('flooding')).toBe('caution');
    expect(hazardSeverityFor('other')).toBe('caution');
  });
});
