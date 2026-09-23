import { EMPTY_HAZARD_REPORT_FORM, parseHazardReportForm } from './hazard-report-form';

const location = { lat: 54.9707, lon: -2.1013 };

describe('parseHazardReportForm', () => {
  it('requires a type', () => {
    expect(parseHazardReportForm({ ...EMPTY_HAZARD_REPORT_FORM, location })).toEqual({
      ok: false,
      message: 'Choose what kind of hazard this is.',
    });
  });

  it('requires a location', () => {
    expect(parseHazardReportForm({ ...EMPTY_HAZARD_REPORT_FORM, type: 'low_bridge' })).toEqual({
      ok: false,
      message: 'Tap the map to drop a pin where it is.',
    });
  });

  it('parses a type-and-location-only report, omitting note/measurement', () => {
    const result = parseHazardReportForm({
      ...EMPTY_HAZARD_REPORT_FORM,
      type: 'tight_bend',
      location,
    });
    expect(result).toEqual({
      ok: true,
      value: { type: 'tight_bend', location, note: undefined, measurement: undefined },
    });
  });

  it('trims and includes a note', () => {
    const result = parseHazardReportForm({
      ...EMPTY_HAZARD_REPORT_FORM,
      type: 'roadworks',
      location,
      note: '  Lane closed near the roundabout  ',
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.note).toBe('Lane closed near the roundabout');
  });

  it('builds a measurement with the right kind and unit for a measured type', () => {
    const result = parseHazardReportForm({
      ...EMPTY_HAZARD_REPORT_FORM,
      type: 'low_bridge',
      location,
      measurementValue: '3.5',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        type: 'low_bridge',
        location,
        note: undefined,
        measurement: { kind: 'height', value: 3.5, unit: 'm' },
      },
    });
  });

  it('ignores a blank measurement value', () => {
    const result = parseHazardReportForm({
      ...EMPTY_HAZARD_REPORT_FORM,
      type: 'weight_limit',
      location,
      measurementValue: '   ',
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.measurement).toBeUndefined();
  });

  it('rejects a zero or negative measurement', () => {
    expect(
      parseHazardReportForm({
        ...EMPTY_HAZARD_REPORT_FORM,
        type: 'width_restriction',
        location,
        measurementValue: '0',
      }),
    ).toEqual({ ok: false, message: 'The measurement must be a positive number.' });
  });

  it('rejects unparseable (non-numeric) measurement input rather than sending NaN', () => {
    expect(
      parseHazardReportForm({
        ...EMPTY_HAZARD_REPORT_FORM,
        type: 'low_bridge',
        location,
        measurementValue: 'abc',
      }),
    ).toEqual({ ok: false, message: 'The measurement must be a positive number.' });
  });
});
