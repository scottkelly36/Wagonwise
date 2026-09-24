import type { ParsedVoiceHazardReportDto } from '@wagonwise/contracts/hazards';

import type { VoiceHazardDraft } from '../db/voice-draft-queue';
import { reportRequestForDraft } from './voice-draft-to-report';

const origin = { lat: 54.9707, lon: -2.1013 };
const parsed: ParsedVoiceHazardReportDto = {
  type: 'low_bridge',
  note: 'Looked lower than signed',
  measurement: { kind: 'height', value: 3.5, unit: 'm' },
};
const draft: VoiceHazardDraft = {
  id: 'draft-1',
  transcript: 'low bridge, looked lower than signed',
  parsed,
  origin: undefined,
  createdAt: '2026-06-15T08:00:00.000Z',
};

describe('reportRequestForDraft', () => {
  it("carries the draft's type, note and measurement, with the given id and origin, source voice", () => {
    const request = reportRequestForDraft(draft, '11111111-1111-4111-8111-111111111111', origin);

    expect(request).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      type: 'low_bridge',
      location: origin,
      note: 'Looked lower than signed',
      measurement: { kind: 'height', value: 3.5, unit: 'm' },
      source: 'voice',
    });
  });

  it('omits note/measurement when the parsed draft has none', () => {
    const bare: VoiceHazardDraft = { ...draft, parsed: { type: 'roadworks' } };
    const request = reportRequestForDraft(bare, '11111111-1111-4111-8111-111111111111', origin);

    expect(request).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      type: 'roadworks',
      location: origin,
      source: 'voice',
    });
  });

  it("always uses the given origin, ignoring the draft's own (possibly stale) one", () => {
    const withOwnOrigin: VoiceHazardDraft = { ...draft, origin: { lat: 1, lon: 1 } };
    const request = reportRequestForDraft(
      withOwnOrigin,
      '11111111-1111-4111-8111-111111111111',
      origin,
    );

    expect(request.location).toEqual(origin);
  });
});
