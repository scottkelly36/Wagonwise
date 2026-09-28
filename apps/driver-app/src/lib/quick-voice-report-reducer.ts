import { toWaitPreset, type WaitMinutesPreset } from './spoken-wait-minutes';

/** The two one-tap voice reports on the active-trip screen, alongside the hazard mic. */
export type QuickReportKind = 'traffic' | 'parking';

export type QuickVoiceReportState =
  | { readonly phase: 'idle' }
  // Traffic only: speaking "How long's the wait?", then listening for the answer.
  | { readonly phase: 'asking-wait' }
  | { readonly phase: 'capturing-wait' }
  // Speaking the read-back ("…Report it?"), then listening for yes/no.
  | {
      readonly phase: 'confirming';
      readonly kind: QuickReportKind;
      readonly waitMinutes?: WaitMinutesPreset | undefined;
      readonly prompt: string;
    }
  | {
      readonly phase: 'capturing-confirmation';
      readonly kind: QuickReportKind;
      readonly waitMinutes?: WaitMinutesPreset | undefined;
    }
  | {
      readonly phase: 'filing';
      readonly kind: QuickReportKind;
      readonly waitMinutes?: WaitMinutesPreset | undefined;
    }
  | { readonly phase: 'filed'; readonly kind: QuickReportKind }
  | { readonly phase: 'not-filed'; readonly kind: QuickReportKind }
  | { readonly phase: 'error'; readonly message: string };

export type QuickVoiceReportEvent =
  | { readonly type: 'start'; readonly kind: QuickReportKind }
  | { readonly type: 'question-spoken' }
  // `waitMinutes` is what the parser found in the reply, or `undefined` for silence, a capture
  // failure, or no number — all of which fall back to the default preset rather than stopping.
  | { readonly type: 'wait-heard'; readonly waitMinutes: number | undefined }
  | { readonly type: 'prompt-spoken' }
  | { readonly type: 'confirmed' }
  | { readonly type: 'declined' }
  | { readonly type: 'file-succeeded' }
  | { readonly type: 'file-failed'; readonly message: string }
  // The microphone can't be used at all (permission off) — there's no way to confirm, so stop.
  | { readonly type: 'capture-failed'; readonly message: string }
  | { readonly type: 'reset' };

export const INITIAL_QUICK_VOICE_REPORT_STATE: QuickVoiceReportState = { phase: 'idle' };

export const WAIT_QUESTION = "How long's the wait?";

export function confirmationPrompt(kind: QuickReportKind, waitMinutes?: number): string {
  if (kind === 'parking') return 'Mark a safe place to park here?';
  return `Traffic, about ${waitMinutes ?? toWaitPreset(undefined)} minutes' wait, here. Report it?`;
}

/** What the app says once the flow ends — spoken as well as shown, since the driver's eyes are
 *  on the road. */
export function outcomeMessage(state: QuickVoiceReportState): string | undefined {
  switch (state.phase) {
    case 'filed':
      return state.kind === 'traffic' ? 'Traffic reported.' : 'Parking marked.';
    case 'not-filed':
      return 'Not reported.';
    case 'error':
      return state.message;
    default:
      return undefined;
  }
}

/** A phase the driver can tap out of (the app is listening). */
export function isListening(state: QuickVoiceReportState): boolean {
  return state.phase === 'capturing-wait' || state.phase === 'capturing-confirmation';
}

/** A phase where the app is talking or saving — every report button stays disabled. */
export function isBusy(state: QuickVoiceReportState): boolean {
  return state.phase === 'asking-wait' || state.phase === 'confirming' || state.phase === 'filing';
}

/** Which report is in progress or just finished (the wait question is always traffic), or
 *  `undefined` when idle or after an error. */
export function activeKind(state: QuickVoiceReportState): QuickReportKind | undefined {
  if (state.phase === 'asking-wait' || state.phase === 'capturing-wait') return 'traffic';
  return 'kind' in state ? state.kind : undefined;
}

/**
 * Pure state machine for the one-tap Traffic and Mark parking voice reports. Traffic: ask the
 * wait → listen → read back → listen for yes/no → file. Parking: read back → listen for yes/no →
 * file. `use-quick-voice-report.ts` drives it from real speech, recognition and network events.
 *
 * Only a clear "yes" files anything (AGENTS.md: voice reports are never filed without driver
 * confirmation). A "no", an unclear reply, silence, or a capture failure at the confirm step all
 * end in `not-filed` — nothing is saved as a draft (user's call, 2026-09-28: a missed traffic or
 * parking report costs nothing, unlike a missed hazard).
 */
export function quickVoiceReportReducer(
  state: QuickVoiceReportState,
  event: QuickVoiceReportEvent,
): QuickVoiceReportState {
  switch (event.type) {
    case 'start':
      if (isBusy(state) || isListening(state)) return state;
      return event.kind === 'traffic'
        ? { phase: 'asking-wait' }
        : { phase: 'confirming', kind: 'parking', prompt: confirmationPrompt('parking') };
    case 'question-spoken':
      return state.phase === 'asking-wait' ? { phase: 'capturing-wait' } : state;
    case 'wait-heard': {
      if (state.phase !== 'capturing-wait') return state;
      const waitMinutes = toWaitPreset(event.waitMinutes);
      return {
        phase: 'confirming',
        kind: 'traffic',
        waitMinutes,
        prompt: confirmationPrompt('traffic', waitMinutes),
      };
    }
    case 'prompt-spoken':
      return state.phase === 'confirming'
        ? { phase: 'capturing-confirmation', kind: state.kind, waitMinutes: state.waitMinutes }
        : state;
    case 'confirmed':
      return state.phase === 'capturing-confirmation'
        ? { phase: 'filing', kind: state.kind, waitMinutes: state.waitMinutes }
        : state;
    case 'declined':
      return state.phase === 'capturing-confirmation'
        ? { phase: 'not-filed', kind: state.kind }
        : state;
    case 'file-succeeded':
      return state.phase === 'filing' ? { phase: 'filed', kind: state.kind } : state;
    case 'file-failed':
      return state.phase === 'filing' ? { phase: 'error', message: event.message } : state;
    case 'capture-failed':
      return isListening(state) ? { phase: 'error', message: event.message } : state;
    case 'reset': {
      // Cancelling mid-listen counts as "not reported", so the driver hears that it stopped.
      const kind = activeKind(state);
      if (isListening(state) && kind !== undefined) return { phase: 'not-filed', kind };
      return INITIAL_QUICK_VOICE_REPORT_STATE;
    }
  }
}
