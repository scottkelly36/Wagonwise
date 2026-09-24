import type { ParsedVoiceHazardReportDto } from '@wagonwise/contracts/hazards';

import { summaryFor } from './voice-report-summary';

describe('summaryFor', () => {
  it("matches the design doc's own example: type, measurement, position, save prompt", () => {
    const parsed: ParsedVoiceHazardReportDto = {
      type: 'low_bridge',
      measurement: { kind: 'height', value: 3.5, unit: 'm' },
    };
    expect(summaryFor(parsed)).toBe('Low bridge, about 3.5 metres, here — save it?');
  });

  it('uses a spoken position hint in place of "here" when one was given', () => {
    const parsed: ParsedVoiceHazardReportDto = {
      type: 'flooding',
      positionHint: 'just past the roundabout',
    };
    expect(summaryFor(parsed)).toBe('Flooding, just past the roundabout — save it?');
  });

  it('omits the measurement clause entirely when there is no measurement', () => {
    const parsed: ParsedVoiceHazardReportDto = { type: 'roadworks' };
    expect(summaryFor(parsed)).toBe('Roadworks, here — save it?');
  });

  it('uses tonnes for a weight measurement', () => {
    const parsed: ParsedVoiceHazardReportDto = {
      type: 'weight_limit',
      measurement: { kind: 'weight', value: 7.5, unit: 't' },
    };
    expect(summaryFor(parsed)).toBe('Too heavy for this road, about 7.5 tonnes, here — save it?');
  });
});
