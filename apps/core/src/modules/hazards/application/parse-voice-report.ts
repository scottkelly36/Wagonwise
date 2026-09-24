import type { HazardParser, ParsedVoiceReport } from './ports/hazard-parser.js';

export interface ParseVoiceReportDeps {
  readonly parser: HazardParser;
}

export interface ParseVoiceReportInput {
  readonly transcript: string;
}

/**
 * Design doc §7 step 3: hands the driver's transcript to the `HazardParser` port and returns
 * whatever it decides — never fails (the port's own contract already folds an unparseable
 * transcript into the `type: 'other'` fallback), so there's no `Result`/error type here, unlike
 * every other use case in this module. Thin on purpose: the app still owns steps 4-5 (speaking
 * the summary back, listening for confirmation, filing the report only on a yes) — this endpoint
 * is only ever the "what did I hear" half.
 */
export async function parseVoiceReport(
  deps: ParseVoiceReportDeps,
  input: ParseVoiceReportInput,
): Promise<ParsedVoiceReport> {
  return deps.parser.parse(input.transcript);
}
