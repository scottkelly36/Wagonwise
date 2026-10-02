import type { JobStatus } from '@wagonwise/contracts/jobs';

export interface JobStatusVoiceStep {
  readonly to: JobStatus;
  readonly label: string;
}

export type JobStatusVoiceState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'capturing-report' }
  | { readonly phase: 'not-understood' }
  // Speaking the step back ("Loaded — is that right?"), then listening for yes/no.
  | { readonly phase: 'confirming'; readonly step: JobStatusVoiceStep }
  | { readonly phase: 'capturing-confirmation'; readonly step: JobStatusVoiceStep }
  | { readonly phase: 'advancing'; readonly step: JobStatusVoiceStep }
  | { readonly phase: 'advanced' }
  | { readonly phase: 'declined' }
  | { readonly phase: 'error'; readonly message: string };

export type JobStatusVoiceEvent =
  | { readonly type: 'start' }
  // `step` is `NEXT_STEP[currentStatus]` at the moment the transcript matched it — there is only
  // ever one, so unlike the hazard flow there's nothing to disambiguate.
  | { readonly type: 'report-matched'; readonly step: JobStatusVoiceStep }
  | { readonly type: 'report-not-matched' }
  | { readonly type: 'report-capture-failed'; readonly message: string }
  | { readonly type: 'prompt-spoken' }
  | { readonly type: 'confirmed' }
  | { readonly type: 'declined' }
  | { readonly type: 'advance-succeeded' }
  | { readonly type: 'advance-failed'; readonly message: string }
  | { readonly type: 'reset' };

export const INITIAL_JOB_STATUS_VOICE_STATE: JobStatusVoiceState = { phase: 'idle' };

export function confirmationPrompt(label: string): string {
  return `${label} — is that right?`;
}

/** What the app says once the flow ends — the driver's eyes are on the road, not the screen. */
export function outcomeMessage(state: JobStatusVoiceState): string | undefined {
  switch (state.phase) {
    case 'advanced':
      return 'Updated.';
    case 'declined':
      return 'Not updated.';
    case 'not-understood':
      return "Didn't catch that.";
    case 'error':
      return state.message;
    default:
      return undefined;
  }
}

/** A phase the driver can tap out of (the app is listening). */
export function isListening(state: JobStatusVoiceState): boolean {
  return state.phase === 'capturing-report' || state.phase === 'capturing-confirmation';
}

/** A phase where the app is talking or saving. */
export function isBusy(state: JobStatusVoiceState): boolean {
  return state.phase === 'confirming' || state.phase === 'advancing';
}

/**
 * Pure state machine for hands-free job-status updates (M5.3, design doc §5: "loaded and
 * leaving"): listen for the driver saying the one step the job can currently move to, read it
 * back, listen for yes/no, then advance. `use-job-status-voice.ts` drives it from real speech,
 * recognition and network events; matching the transcript against the current status's trigger
 * words (`lib/job-status.ts`'s `matchesJobStatusTrigger`) happens there too, since it's a plain
 * synchronous lookup, not something worth a "parsing" phase of its own (unlike the hazard flow's
 * server round trip).
 *
 * Only a clear "yes" advances anything (AGENTS.md: a driver confirms, the app never acts on its
 * own). A "no", an unclear reply, or a capture failure at the confirm step all leave the job where
 * it was — there's no draft concept here, unlike hazard reports: a missed voice update costs
 * nothing since the tap button (M5.2) is always right there as a fallback.
 */
export function jobStatusVoiceReducer(
  state: JobStatusVoiceState,
  event: JobStatusVoiceEvent,
): JobStatusVoiceState {
  switch (event.type) {
    case 'start':
      return isBusy(state) || isListening(state) ? state : { phase: 'capturing-report' };
    case 'report-matched':
      return state.phase === 'capturing-report' ? { phase: 'confirming', step: event.step } : state;
    case 'report-not-matched':
      return state.phase === 'capturing-report' ? { phase: 'not-understood' } : state;
    case 'report-capture-failed':
      return { phase: 'error', message: event.message };
    case 'prompt-spoken':
      return state.phase === 'confirming'
        ? { phase: 'capturing-confirmation', step: state.step }
        : state;
    case 'confirmed':
      return state.phase === 'capturing-confirmation'
        ? { phase: 'advancing', step: state.step }
        : state;
    case 'declined':
      return state.phase === 'capturing-confirmation' ? { phase: 'declined' } : state;
    case 'advance-succeeded':
      return state.phase === 'advancing' ? { phase: 'advanced' } : state;
    case 'advance-failed':
      return state.phase === 'advancing' ? { phase: 'error', message: event.message } : state;
    case 'reset':
      return INITIAL_JOB_STATUS_VOICE_STATE;
  }
}
