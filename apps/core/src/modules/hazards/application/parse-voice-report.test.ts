import { describe, expect, it } from 'vitest';
import type { HazardParser, ParsedVoiceReport } from './ports/hazard-parser.js';
import { parseVoiceReport } from './parse-voice-report.js';

class StubHazardParser implements HazardParser {
  public lastTranscript: string | undefined;
  constructor(private readonly result: ParsedVoiceReport) {}

  parse(transcript: string): Promise<ParsedVoiceReport> {
    this.lastTranscript = transcript;
    return Promise.resolve(this.result);
  }
}

describe('parseVoiceReport', () => {
  it('passes the transcript to the parser and returns its result unchanged', async () => {
    const parser = new StubHazardParser({
      type: 'low_bridge',
      measurement: { kind: 'height', value: 3.5, unit: 'm' },
    });
    const result = await parseVoiceReport(
      { parser },
      { transcript: 'low bridge, three and a half metres' },
    );

    expect(parser.lastTranscript).toBe('low bridge, three and a half metres');
    expect(result).toEqual({
      type: 'low_bridge',
      measurement: { kind: 'height', value: 3.5, unit: 'm' },
    });
  });
});
