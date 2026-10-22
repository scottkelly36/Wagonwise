import type { VoiceReportFlowState } from './voice-report-flow-reducer';

/** How long a result stays on the map before it clears: long enough to read at a glance, short enough not to linger. */
export const RESULT_MS = 6_000;
/** An error says more, so it stays a little longer. */
export const RESULT_ERROR_MS = 9_000;

/** The voice hazard report has finished, one way or another, and what it says is only a result to show and clear. */
export function isFlowResult(state: VoiceReportFlowState): boolean {
  return (
    state.phase === 'filed' ||
    state.phase === 'queued' ||
    state.phase === 'draft-saved' ||
    state.phase === 'report-no-speech' ||
    state.phase === 'error'
  );
}

/** What is said aloud as the report ends: the driver's eyes are on the road, not the screen. */
export function flowOutcomeSpeech(state: VoiceReportFlowState): string | undefined {
  switch (state.phase) {
    case 'filed':
      return 'Saved.';
    case 'queued':
      return 'Saved. It will be sent when you are back online.';
    case 'draft-saved':
      return 'Not filed. Saved as a draft.';
    case 'report-no-speech':
      return 'I did not hear anything.';
    case 'error':
      return state.message;
    default:
      return undefined;
  }
}
