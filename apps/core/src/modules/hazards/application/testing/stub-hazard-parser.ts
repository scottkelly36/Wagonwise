import type { HazardParser, ParsedVoiceReport } from '../ports/hazard-parser.js';

/** A deterministic `HazardParser` test double — same role `InMemoryHazardRepository` plays for
 *  `HazardRepository` (interface-layer tests must never import `infrastructure/` directly,
 *  AGENTS.md rule 5's `interface-no-infrastructure` check). Defaults to the same "couldn't
 *  classify it" fallback `NullHazardParser`/`AnthropicHazardParser` both use — `type: 'other'`,
 *  the transcript itself as the note — so a route test that doesn't care about parsing specifics
 *  still gets a realistic, deterministic response. */
export class StubHazardParser implements HazardParser {
  constructor(private readonly result?: ParsedVoiceReport) {}

  parse(transcript: string): Promise<ParsedVoiceReport> {
    return Promise.resolve(this.result ?? { type: 'other', note: transcript });
  }
}
