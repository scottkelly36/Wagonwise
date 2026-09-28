import type { MapPoint } from '../components/route-map';

export type VoiceCaptureStatus =
  'idle' | 'starting' | 'permission-denied' | 'listening' | 'transcribed' | 'no-speech' | 'error';

export interface VoiceCaptureState {
  readonly status: VoiceCaptureStatus;
  readonly origin?: MapPoint | undefined;
  readonly transcript?: string | undefined;
  readonly errorMessage?: string | undefined;
}

export type VoiceCaptureEvent =
  | { readonly type: 'start-requested' }
  | { readonly type: 'permission-denied' }
  | { readonly type: 'native-started'; readonly origin: MapPoint | undefined }
  | { readonly type: 'result'; readonly transcript: string }
  | { readonly type: 'no-speech' }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'reset' };

export const INITIAL_VOICE_CAPTURE_STATE: VoiceCaptureState = { status: 'idle' };

/**
 * Pure state machine for the mic button's capture session (design doc §7 steps 1-2). Every native
 * event `use-voice-report-capture.ts` receives is translated into one of these events, so the
 * "what does this event mean for the UI" logic is unit-testable without a real speech recognizer
 * — same "pure logic, effects injected at the edge" split as `push-registration.ts`, just shaped
 * as a reducer instead of a single async function, since a capture session is inherently a
 * sequence of events over time rather than one call-and-response. Deliberately produces only a
 * transcript plus the GPS position captured when recording started — parsing and filing the
 * report are M7.3's job.
 */
export function voiceCaptureReducer(
  state: VoiceCaptureState,
  event: VoiceCaptureEvent,
): VoiceCaptureState {
  switch (event.type) {
    case 'start-requested':
      return { status: 'starting' };
    case 'permission-denied':
      return { status: 'permission-denied' };
    // Speech recognition is one app-wide native module, so its events reach every mounted
    // capture hook (active-trip.tsx runs two: the hazard flow and the quick traffic/parking
    // flow). Each instance only accepts events for a session it started itself; anything
    // arriving while it's idle or finished belongs to the other hook and is ignored.
    case 'native-started':
      return state.status === 'starting' ? { status: 'listening', origin: event.origin } : state;
    case 'result':
      return state.status === 'listening' || state.status === 'starting'
        ? { status: 'transcribed', origin: state.origin, transcript: event.transcript }
        : state;
    case 'no-speech':
      // Only meaningful while a capture session is actually in flight — a transcript, an error or
      // a permission denial may already have arrived before the recognizer's own trailing `end`
      // event fires, and a late no-speech signal must never overwrite any of those.
      return state.status === 'listening' || state.status === 'starting'
        ? { status: 'no-speech', origin: state.origin }
        : state;
    case 'error':
      return state.status === 'listening' || state.status === 'starting'
        ? { status: 'error', errorMessage: event.message }
        : state;
    case 'reset':
      return { status: 'idle' };
  }
}
