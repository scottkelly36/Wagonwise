import type { JobStatus } from '@wagonwise/contracts/jobs';
import * as Speech from 'expo-speech';
import { useEffect, useReducer, useRef } from 'react';

import { useAdvanceJobStatus } from '../api/use-jobs';
import { MIC_OFF_MESSAGE } from '../lib/mic-off-message';
import { matchesJobStatusTrigger, NEXT_STEP } from '../lib/job-status';
import {
  confirmationPrompt,
  INITIAL_JOB_STATUS_VOICE_STATE,
  jobStatusVoiceReducer,
  outcomeMessage,
  type JobStatusVoiceState,
} from '../lib/job-status-voice-reducer';
import { parseYesNo } from '../lib/yes-no-parser';
import { useVoiceReportCapture } from './use-voice-report-capture';

const SAVE_FAILED_MESSAGE = "Couldn't save that. Try again when you have signal.";

function speak(text: string, onDone?: () => void): void {
  Speech.speak(text, {
    language: 'en-GB',
    onDone,
    onError: onDone, // fail open — still move on
  });
}

/**
 * Glue for hands-free job-status updates (M5.3, design doc §5): tap, say the step ("loaded and
 * leaving"), hear it read back, say yes. The rules live in `jobStatusVoiceReducer`; this only
 * turns native speech events and the advance mutation into its events, reusing the same
 * `useVoiceReportCapture` every other voice flow in this app does.
 *
 * `currentStatus` is read fresh on every capture rather than closed over once, since a driver can
 * sit on the job screen for a while before tapping the mic.
 */
export function useJobStatusVoice(
  jobId: string,
  currentStatus: JobStatus,
): {
  readonly state: JobStatusVoiceState;
  readonly start: () => void;
  readonly cancel: () => void;
} {
  const [state, dispatch] = useReducer(jobStatusVoiceReducer, INITIAL_JOB_STATUS_VOICE_STATE);
  const capture = useVoiceReportCapture();
  const advance = useAdvanceJobStatus();

  const statusRef = useRef(currentStatus);
  useEffect(() => {
    statusRef.current = currentStatus;
  }, [currentStatus]);

  // True only between our own `capture.start()` and the result we consume — same reasoning as
  // `use-quick-voice-report.ts`'s own ref: the capture hook keeps its last result after a session
  // ends, so without this a yes/no reply would be re-read as the next report's transcript.
  const awaitingCaptureRef = useRef(false);

  // Start listening whenever the flow enters a listening phase.
  useEffect(() => {
    if (state.phase !== 'capturing-report' && state.phase !== 'capturing-confirmation') return;
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
      dispatch({ type: 'report-capture-failed', message: MIC_OFF_MESSAGE });
      return;
    }
    if (state.phase === 'capturing-report') {
      const heard = status === 'transcribed' ? transcript : undefined;
      const nextStep = NEXT_STEP[statusRef.current];
      if (
        nextStep !== undefined &&
        heard !== undefined &&
        matchesJobStatusTrigger(heard, statusRef.current)
      ) {
        dispatch({ type: 'report-matched', step: nextStep });
      } else {
        dispatch({ type: 'report-not-matched' });
      }
    } else if (state.phase === 'capturing-confirmation') {
      const yes = status === 'transcribed' && parseYesNo(transcript ?? '') === 'yes';
      dispatch({ type: yes ? 'confirmed' : 'declined' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture.state]);

  // Speak the read-back once the transcript's matched.
  useEffect(() => {
    if (state.phase === 'confirming') {
      speak(confirmationPrompt(state.step.label), () => dispatch({ type: 'prompt-spoken' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Advance on a yes.
  useEffect(() => {
    if (state.phase !== 'advancing') return;
    advance.mutate(
      { jobId, status: state.step.to },
      {
        onSuccess: () => dispatch({ type: 'advance-succeeded' }),
        onError: () => dispatch({ type: 'advance-failed', message: SAVE_FAILED_MESSAGE }),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Say how it ended — the driver's eyes are on the road, not the screen.
  useEffect(() => {
    const message = outcomeMessage(state);
    if (message !== undefined) speak(message);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Leaving the screen mid-flow shouldn't leave the phone talking or listening.
  useEffect(
    () => () => {
      void Speech.stop();
    },
    [],
  );

  return {
    state,
    start: () => dispatch({ type: 'start' }),
    cancel: () => {
      awaitingCaptureRef.current = false;
      capture.cancel();
      void Speech.stop();
      dispatch({ type: 'reset' });
    },
  };
}
