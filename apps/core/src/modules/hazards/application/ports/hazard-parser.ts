import type { HazardType, Measurement } from '../../domain/hazard-report.js';

/** Design doc §7 step 3's `{ type, note, measurement?, positionHint? }` — everything the app
 *  needs to speak back a confirmation summary and, on confirm, file the report. `positionHint`
 *  ("just past the roundabout") is kept as free text in Phase 1 (design doc §7 step 5) — nothing
 *  resolves it to a location; the pin still uses the GPS position the app captured when recording
 *  started. */
export interface ParsedVoiceReport {
  readonly type: HazardType;
  readonly note?: string | undefined;
  readonly measurement?: Measurement | undefined;
  readonly positionHint?: string | undefined;
}

/**
 * Turns a driver's spoken transcript into a structured hazard report (design doc §7 step 3).
 * Never rejects a transcript outright — implementations must apply the design doc's own fallback
 * ("invalid output is rejected and retried once, then falls back to type `other` with the raw
 * transcript as the note") internally, so a caller always gets a value back. Only a genuine infra
 * fault (the LLM API unreachable, a non-2xx response) throws — matches every other external-call
 * port in this codebase (`RoutingEngine`, `PushNotifier`): an expected "couldn't confidently
 * classify this" outcome is a value, not an error.
 */
export interface HazardParser {
  parse(transcript: string): Promise<ParsedVoiceReport>;
}
