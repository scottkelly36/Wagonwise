import type { HazardParser, ParsedVoiceReport } from '../application/ports/hazard-parser.js';

/**
 * Always returns the design doc's own "couldn't parse" fallback — `type: 'other'`, the raw
 * transcript as `note` — with no LLM call at all. Wired as the default when `ANTHROPIC_API_KEY`
 * is unset (`composeCore`), so `pnpm dev` still works with zero configuration (the cold-start
 * promise): voice reports just always land as `other` until a key is added. Also useful as an
 * explicit test double, the same role `ConsolePushNotifier`/`ConsoleOtpSender` play for their own
 * ports.
 */
export class NullHazardParser implements HazardParser {
  parse(transcript: string): Promise<ParsedVoiceReport> {
    return Promise.resolve({ type: 'other', note: transcript });
  }
}
