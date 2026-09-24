import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorCode,
} from 'expo-speech-recognition';
import { useCallback, useReducer, useRef } from 'react';

import type { MapPoint } from '../components/route-map';
import { fetchCurrentLocation } from './use-current-location';
import {
  voiceCaptureReducer,
  INITIAL_VOICE_CAPTURE_STATE,
  type VoiceCaptureState,
} from '../lib/voice-capture-reducer';
import { obtainVoiceCapturePermission } from '../lib/voice-report-permission';

// Design doc §7: "no final speech was detected" is a routine outcome (a driver who taps the mic
// and doesn't end up saying anything, or cab noise drowns them out), not an error to surface the
// same way as a genuine recognizer fault.
const NO_SPEECH_CODES: ReadonlySet<ExpoSpeechRecognitionErrorCode> = new Set([
  'no-speech',
  'speech-timeout',
]);

/**
 * Wires the real `expo-speech-recognition` native module into `voiceCaptureReducer`'s pure state
 * machine — same "effects injected/wired at the edge, pure logic tested directly" split as
 * `use-register-push-token.ts`. `continuous: false` + `interimResults: false` (design doc §7:
 * hands-free, no partial results to read on screen while driving) means the module runs until it
 * either has one final result or gives up, so this only ever needs to handle one `result`.
 */
export function useVoiceReportCapture(): {
  readonly state: VoiceCaptureState;
  readonly start: () => void;
  readonly cancel: () => void;
  readonly reset: () => void;
} {
  const [state, dispatch] = useReducer(voiceCaptureReducer, INITIAL_VOICE_CAPTURE_STATE);
  // The native `start` event has no way to carry data back to the caller — the origin captured
  // at button-press time is stashed here so the `start` listener below can attach it once the
  // recognizer confirms it's actually listening.
  const pendingOriginRef = useRef<MapPoint | undefined>(undefined);

  useSpeechRecognitionEvent('start', () => {
    dispatch({ type: 'native-started', origin: pendingOriginRef.current });
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript;
    if (event.isFinal && transcript !== undefined && transcript.length > 0) {
      dispatch({ type: 'result', transcript });
    }
  });

  useSpeechRecognitionEvent('end', () => {
    dispatch({ type: 'no-speech' });
  });

  useSpeechRecognitionEvent('error', (event) => {
    if (NO_SPEECH_CODES.has(event.error)) {
      dispatch({ type: 'no-speech' });
    } else {
      dispatch({ type: 'error', message: event.message || event.error });
    }
  });

  const start = useCallback(() => {
    dispatch({ type: 'start-requested' });

    async function run(): Promise<void> {
      const [permission, location] = await Promise.all([
        obtainVoiceCapturePermission({
          getPermissionsAsync: ExpoSpeechRecognitionModule.getPermissionsAsync,
          requestPermissionsAsync: ExpoSpeechRecognitionModule.requestPermissionsAsync,
        }),
        fetchCurrentLocation(),
      ]);
      if (!permission.ok) {
        dispatch({ type: 'permission-denied' });
        return;
      }
      // Origin is best-effort — a driver who's denied location, or has no fix yet, still gets to
      // report by voice; M7.3's filing step falls back the same way the tap flow already does
      // (`report-hazard.tsx`'s `effectivePin ?? location.point`).
      pendingOriginRef.current = location.ok ? location.point : undefined;
      ExpoSpeechRecognitionModule.start({
        lang: 'en-GB',
        interimResults: false,
        continuous: false,
      });
    }

    void run();
  }, []);

  // Escape hatch for a driver who taps the mic then changes their mind, or a recognizer that
  // never reaches a natural end — without this, `starting`/`listening` would be a dead end until
  // the native module fires its own `end`/`error` event on its own schedule.
  const cancel = useCallback(() => {
    ExpoSpeechRecognitionModule.abort();
    dispatch({ type: 'reset' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  return { state, start, cancel, reset };
}
