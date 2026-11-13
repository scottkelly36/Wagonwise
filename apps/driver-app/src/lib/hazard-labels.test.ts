import {
  canTypeInFeet,
  hazardSeverityFor,
  hazardWarningSpeech,
  measurementEcho,
  measurementKindFor,
  measurementLabelFor,
  measurementUnitFor,
} from './hazard-labels';

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

describe('hazardWarningSpeech', () => {
  it('says a camera is ahead, and a hazard by its name', () => {
    expect(hazardWarningSpeech('speed_camera')).toBe('Speed camera ahead');
    expect(hazardWarningSpeech('mobile_camera')).toBe('Mobile speed camera ahead');
    expect(hazardWarningSpeech('low_bridge')).toBe('Hazard ahead: Low bridge');
  });

  it('rates the camera types as take-care, not cannot-pass', () => {
    expect(hazardSeverityFor('speed_camera')).toBe('caution');
    expect(hazardSeverityFor('mobile_camera')).toBe('caution');
  });
});

describe('measurementLabelFor and canTypeInFeet', () => {
  it('asks for feet and inches for a height or width when that is the driver unit', () => {
    expect(measurementLabelFor('height', 'feet')).toContain('feet and inches');
    expect(measurementLabelFor('width', 'feet')).toContain('feet and inches');
    expect(measurementLabelFor('height', 'metres')).toContain('metres');
    expect(measurementLabelFor('height')).toContain('metres');
  });

  it('always asks for tonnes for a weight', () => {
    expect(measurementLabelFor('weight', 'feet')).toContain('tonnes');
    expect(canTypeInFeet('weight')).toBe(false);
    expect(canTypeInFeet('height')).toBe(true);
    expect(canTypeInFeet('width')).toBe(true);
  });
});

describe('measurementEcho', () => {
  it('shows a height typed in metres in feet and inches too, so 13.9 is seen to be 45 feet', () => {
    expect(measurementEcho('height', '4.19', 'metres')).toBe('4.19m (13\'9")');
    expect(measurementEcho('height', '13.9', 'metres')).toContain("45'");
  });

  it('shows what feet and inches come to in metres', () => {
    expect(measurementEcho('height', '4.191', 'feet')).toBe('4.19 m');
    expect(measurementEcho('width', '2.286', 'feet')).toBe('2.29 m');
  });

  it('has nothing for an empty or invalid box, a width in metres, or a weight', () => {
    expect(measurementEcho('height', '', 'metres')).toBeUndefined();
    expect(measurementEcho('height', 'NaN', 'feet')).toBeUndefined();
    expect(measurementEcho('width', '2.5', 'metres')).toBeUndefined();
    expect(measurementEcho('weight', '7.5', 'feet')).toBeUndefined();
  });
});
