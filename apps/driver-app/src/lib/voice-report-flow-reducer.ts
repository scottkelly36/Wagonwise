import type { ParsedVoiceHazardReportDto } from '@wagonwise/contracts/hazards';

import type { MapPoint } from '../components/route-map';

export type VoiceReportFlowState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'capturing-report' }
  | { readonly phase: 'report-no-speech' }
  | {
      readonly phase: 'parsing';
      readonly transcript: string;
      readonly origin: MapPoint | undefined;
    }
  | {
      readonly phase: 'speaking-summary';
      readonly transcript: string;
      readonly origin: MapPoint | undefined;
      readonly parsed: ParsedVoiceHazardReportDto;
      readonly summary: string;
    }
  | {
      readonly phase: 'capturing-confirmation';
      readonly transcript: string;
      readonly origin: MapPoint | undefined;
      readonly parsed: ParsedVoiceHazardReportDto;
    }
  | {
      readonly phase: 'filing';
      readonly parsed: ParsedVoiceHazardReportDto;
      readonly origin: MapPoint;
    }
  | { readonly phase: 'filed' }
  | { readonly phase: 'queued' }
  | {
      readonly phase: 'draft-saved';
      readonly transcript: string;
      readonly parsed: ParsedVoiceHazardReportDto;
    }
  | { readonly phase: 'error'; readonly message: string };

export type VoiceReportFlowEvent =
  | { readonly type: 'start' }
  | {
      readonly type: 'report-transcript';
      readonly transcript: string;
      readonly origin: MapPoint | undefined;
    }
  | { readonly type: 'report-no-speech' }
  | { readonly type: 'report-capture-failed'; readonly message: string }
  | {
      readonly type: 'parse-succeeded';
      readonly parsed: ParsedVoiceHazardReportDto;
      readonly summary: string;
    }
  | { readonly type: 'parse-failed'; readonly message: string }
  | { readonly type: 'speech-done' }
  // `origin` is already resolved by the hook (captured origin, or the live-position fallback) by
  // the time this is dispatched — the reducer never has to know where that came from.
  | { readonly type: 'confirmation-yes'; readonly origin: MapPoint }
  | { readonly type: 'confirmation-declined' }
  | { readonly type: 'file-succeeded' }
  | { readonly type: 'file-failed' }
  | { readonly type: 'reset' };

export const INITIAL_VOICE_REPORT_FLOW_STATE: VoiceReportFlowState = { phase: 'idle' };

/**
 * Pure state machine for the whole voice-report flow (design doc §7 steps 1-4): capture a
 * transcript, parse it (M7.1's endpoint), speak a summary back, capture a yes/no reply, then
 * either file the report or save it as an unconfirmed draft. `use-voice-hazard-report-flow.ts`
 * is the thin glue driving this from real native events, mutations and speech synthesis — this
 * file is the "what does each outcome mean for the flow" logic, unit-testable on its own.
 *
 * An explicit "no", an unclear reply, a confirmation-capture failure, a timed-out confirmation
 * (the capture reducer's own `no-speech`, reused here as design doc §7 step 4's "no answer within
 * a few seconds"), and a "yes" with nowhere to resolve a location for are all routed to the same
 * `confirmation-declined` event — every one of those means "don't file this without a proper
 * look," and the safe response to all of them is the same unconfirmed draft, never silently
 * discarding a report a driver tried to make (AGENTS.md: "Voice reports are never filed publicly
 * without driver confirmation").
 */
export function voiceReportFlowReducer(
  state: VoiceReportFlowState,
  event: VoiceReportFlowEvent,
): VoiceReportFlowState {
  switch (event.type) {
    case 'start':
      return { phase: 'capturing-report' };
    case 'report-transcript':
      return { phase: 'parsing', transcript: event.transcript, origin: event.origin };
    case 'report-no-speech':
      return { phase: 'report-no-speech' };
    case 'report-capture-failed':
      return { phase: 'error', message: event.message };
    case 'parse-succeeded':
      if (state.phase !== 'parsing') return state;
      return {
        phase: 'speaking-summary',
        transcript: state.transcript,
        origin: state.origin,
        parsed: event.parsed,
        summary: event.summary,
      };
    case 'parse-failed':
      return { phase: 'error', message: event.message };
    case 'speech-done':
      if (state.phase !== 'speaking-summary') return state;
      return {
        phase: 'capturing-confirmation',
        transcript: state.transcript,
        origin: state.origin,
        parsed: state.parsed,
      };
    case 'confirmation-yes':
      if (state.phase !== 'capturing-confirmation') return state;
      return { phase: 'filing', parsed: state.parsed, origin: event.origin };
    case 'confirmation-declined':
      if (state.phase !== 'capturing-confirmation') return state;
      return { phase: 'draft-saved', transcript: state.transcript, parsed: state.parsed };
    case 'file-succeeded':
      return { phase: 'filed' };
    case 'file-failed':
      return { phase: 'queued' };
    case 'reset':
      return { phase: 'idle' };
  }
}
