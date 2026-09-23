import { measurementKindFor, measurementUnitFor } from './hazard-labels';

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
