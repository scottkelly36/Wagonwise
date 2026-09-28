import { congestionReportIdSchema } from '@wagonwise/contracts/congestion';
import { safeParkingSpotIdSchema } from '@wagonwise/contracts/parking';
import * as Crypto from 'expo-crypto';
import * as Speech from 'expo-speech';
import { useEffect, useReducer, useRef } from 'react';

import { useReportCongestion } from '../api/use-congestion';
import { useReportSafeParkingSpot } from '../api/use-parking';
import type { MapPoint } from '../components/route-map';
import {
  INITIAL_QUICK_VOICE_REPORT_STATE,
  outcomeMessage,
  quickVoiceReportReducer,
  WAIT_QUESTION,
  type QuickReportKind,
  type QuickVoiceReportState,
} from '../lib/quick-voice-report-reducer';
import { DEFAULT_WAIT_MINUTES, parseSpokenWaitMinutes } from '../lib/spoken-wait-minutes';
import { parseYesNo } from '../lib/yes-no-parser';
import { useVoiceReportCapture } from './use-voice-report-capture';

const NO_SIGNAL_MESSAGE = "Couldn't send that. Try again when you have signal.";
const NO_LOCATION_MESSAGE = "Couldn't find where you are, so nothing was reported.";

function speak(text: string, onDone?: () => void): void {
  Speech.speak(text, {
    language: 'en-GB',
    onDone,
    onError: onDone, // fail open — still move on to listening
  });
}

/**
 * Glue for the one-tap Traffic and Mark parking voice reports on the active-trip screen:
 * speech prompts (`expo-speech`), yes/no and wait-time capture (the same `useVoiceReportCapture`
 * the hazard flow uses), and filing through the existing congestion/parking mutations. The rules
 * live in `quickVoiceReportReducer`; this only turns native and network events into its events.
 *
 * Filed at `currentPosition`, the driver's live position at the moment they say yes. No offline
 * queue (unlike hazards): with no signal the driver is told and nothing is retried.
 */
export function useQuickVoiceReport(currentPosition: MapPoint | undefined): {
  readonly state: QuickVoiceReportState;
  readonly start: (kind: QuickReportKind) => void;
  readonly cancel: () => void;
} {
  const [state, dispatch] = useReducer(quickVoiceReportReducer, INITIAL_QUICK_VOICE_REPORT_STATE);
  const capture = useVoiceReportCapture();
  const reportCongestion = useReportCongestion();
  const reportParking = useReportSafeParkingSpot();

  const positionRef = useRef(currentPosition);
  useEffect(() => {
    positionRef.current = currentPosition;
  }, [currentPosition]);

  // True only between our own `capture.start()` and the result we consume. The capture hook
  // keeps its last result after a session ends, so without this the wait answer ("20 minutes")
  // would be read again as the yes/no reply the moment the flow starts listening for one.
  const awaitingCaptureRef = useRef(false);

  // Start listening whenever the flow enters a listening phase.
  useEffect(() => {
    if (state.phase !== 'capturing-wait' && state.phase !== 'capturing-confirmation') return;
    awaitingCaptureRef.current = true;
    capture.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Interpret the capture session that just ended.
  useEffect(() => {
    if (!awaitingCaptureRef.current) return;
    const { status, transcript } = capture.state;
    if (status === 'idle' || status === 'starting' || status === 'listening') return;
    awaitingCaptureRef.current = false;

    if (status === 'permission-denied') {
      dispatch({ type: 'capture-failed', message: 'Microphone access is off.' });
      return;
    }
    if (state.phase === 'capturing-wait') {
      // Silence or a recognizer error still moves on, with the default wait.
      const heard = status === 'transcribed' ? transcript : undefined;
      dispatch({
        type: 'wait-heard',
        waitMinutes: heard === undefined ? undefined : parseSpokenWaitMinutes(heard),
      });
    } else if (state.phase === 'capturing-confirmation') {
      const yes = status === 'transcribed' && parseYesNo(transcript ?? '') === 'yes';
      dispatch({ type: yes ? 'confirmed' : 'declined' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture.state]);

  // Spoken prompts: the wait question (traffic), then the read-back.
  useEffect(() => {
    if (state.phase === 'asking-wait') {
      speak(WAIT_QUESTION, () => dispatch({ type: 'question-spoken' }));
    } else if (state.phase === 'confirming') {
      speak(state.prompt, () => dispatch({ type: 'prompt-spoken' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // File on a yes.
  useEffect(() => {
    if (state.phase !== 'filing') return;
    const location = positionRef.current;
    if (location === undefined) {
      dispatch({ type: 'file-failed', message: NO_LOCATION_MESSAGE });
      return;
    }
    const callbacks = {
      onSuccess: () => dispatch({ type: 'file-succeeded' }),
      onError: () => dispatch({ type: 'file-failed', message: NO_SIGNAL_MESSAGE }),
    };
    if (state.kind === 'traffic') {
      reportCongestion.mutate(
        {
          id: congestionReportIdSchema.parse(Crypto.randomUUID()),
          location,
          estimatedWaitMinutes: state.waitMinutes ?? DEFAULT_WAIT_MINUTES,
        },
        callbacks,
      );
    } else {
      reportParking.mutate(
        { id: safeParkingSpotIdSchema.parse(Crypto.randomUUID()), location },
        callbacks,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Say how it ended — the driver's eyes are on the road, not the screen.
  useEffect(() => {
    const message = outcomeMessage(state);
    if (message !== undefined) speak(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Leaving the screen mid-report shouldn't leave the phone talking or listening.
  useEffect(
    () => () => {
      void Speech.stop();
    },
    [],
  );

  return {
    state,
    start: (kind) => dispatch({ type: 'start', kind }),
    cancel: () => {
      awaitingCaptureRef.current = false;
      capture.cancel();
      void Speech.stop();
      dispatch({ type: 'reset' });
    },
  };
}
