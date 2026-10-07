import { hazardReportIdSchema, type ReportHazardRequest } from '@wagonwise/contracts/hazards';
import * as Crypto from 'expo-crypto';
import * as Speech from 'expo-speech';
import { useEffect, useReducer, useRef } from 'react';

import { useParseVoiceHazardReport, useReportHazard } from '../api/use-hazards';
import type { MapPoint } from '../components/route-map';
import { enqueueHazardReport, removeQueuedHazardReport } from '../db/hazard-queue';
import { saveVoiceHazardDraft } from '../db/voice-draft-queue';
import {
  voiceReportFlowReducer,
  INITIAL_VOICE_REPORT_FLOW_STATE,
  type VoiceReportFlowState,
} from '../lib/voice-report-flow-reducer';
import { MIC_OFF_MESSAGE } from '../lib/mic-off-message';
import { summaryFor } from '../lib/voice-report-summary';
import { parseYesNo } from '../lib/yes-no-parser';
import { useVoiceReportCapture } from './use-voice-report-capture';

/**
 * Orchestrates design doc §7 steps 1-4 end to end: capture a transcript (`useVoiceReportCapture`,
 * M7.2), parse it (M7.1's endpoint), speak a summary back (`expo-speech`), capture a yes/no reply
 * (the same capture hook, run a second time), then either file the report or save it as an
 * unconfirmed draft. `voiceReportFlowReducer` is the pure "what does each outcome mean" logic;
 * this hook is the thin glue driving it from real native events and network calls — same split
 * as `use-voice-report-capture.ts` itself, one layer up.
 *
 * `fallbackOrigin` (the live position `active-trip.tsx` already tracks) is used only if the
 * capture-time GPS fix failed — mirrors `report-hazard.tsx`'s own `effectivePin ?? location.point`
 * pattern for the tap flow. If neither is available, a "yes" still can't be filed with no
 * location, so it's treated the same as a decline: saved as a draft, not lost.
 */
export function useVoiceHazardReportFlow(fallbackOrigin: MapPoint | undefined): {
  readonly state: VoiceReportFlowState;
  readonly start: () => void;
  readonly reset: () => void;
} {
  const [state, dispatch] = useReducer(voiceReportFlowReducer, INITIAL_VOICE_REPORT_FLOW_STATE);
  const capture = useVoiceReportCapture();
  const parseMutation = useParseVoiceHazardReport();
  const reportMutation = useReportHazard();
  // Read inside effects without adding it as a dependency that would re-trigger them.
  const fallbackOriginRef = useRef(fallbackOrigin);
  useEffect(() => {
    fallbackOriginRef.current = fallbackOrigin;
  }, [fallbackOrigin]);

  // True only between our own `capture.start()` and the result we consume. The capture hook keeps
  // its last result after a session ends, so without this the report itself ("low bridge…") was
  // read again as the yes/no reply the moment the flow started listening for one — every voice
  // report ended up as a draft, even after a clear "yes" (fixed 2026-09-28).
  const awaitingCaptureRef = useRef(false);

  // Steps 1-2 / step 4's reply: interpret the capture hook's own terminal states, depending on
  // which of the two capture sessions (the report itself, or the yes/no reply) is in flight.
  useEffect(() => {
    if (!awaitingCaptureRef.current) return;
    const status = capture.state.status;
    if (status === 'idle' || status === 'starting' || status === 'listening') return;
    awaitingCaptureRef.current = false;

    if (state.phase === 'capturing-report') {
      if (status === 'transcribed' && capture.state.transcript !== undefined) {
        dispatch({
          type: 'report-transcript',
          transcript: capture.state.transcript,
          origin: capture.state.origin,
        });
      } else if (status === 'no-speech') {
        dispatch({ type: 'report-no-speech' });
      } else if (status === 'permission-denied') {
        dispatch({ type: 'report-capture-failed', message: MIC_OFF_MESSAGE });
      } else if (status === 'error') {
        dispatch({
          type: 'report-capture-failed',
          message: capture.state.errorMessage ?? "Couldn't hear that.",
        });
      }
    } else if (state.phase === 'capturing-confirmation') {
      const heardYes =
        status === 'transcribed' && parseYesNo(capture.state.transcript ?? '') === 'yes';
      const effectiveOrigin = state.origin ?? fallbackOriginRef.current;
      // An explicit "no", an unclear reply, a capture error/permission denial, a timed-out
      // silence (no-speech — design doc §7 step 4's "no answer within a few seconds"), and a
      // clear "yes" with nowhere to resolve a location from are all the same outcome here: never
      // file without both a clear yes and somewhere to put the pin.
      if (heardYes && effectiveOrigin !== undefined) {
        dispatch({ type: 'confirmation-yes', origin: effectiveOrigin });
      } else {
        dispatch({ type: 'confirmation-declined' });
      }
    }
  }, [capture.state, state]);

  // Step 3: parse the transcript once captured.
  useEffect(() => {
    if (state.phase !== 'parsing') return;
    const { transcript } = state;
    parseMutation.mutate(transcript, {
      onSuccess: (parsed) =>
        dispatch({ type: 'parse-succeeded', parsed, summary: summaryFor(parsed) }),
      onError: () =>
        dispatch({ type: 'parse-failed', message: "Couldn't work out what you said." }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Step 4a: speak the summary back once parsed, then step 4b: start the second capture session,
  // listening for the driver's yes/no reply.
  useEffect(() => {
    if (state.phase !== 'speaking-summary') return;
    const { summary } = state;
    Speech.speak(summary, {
      language: 'en-GB',
      onDone: () => dispatch({ type: 'speech-done' }),
      onError: () => dispatch({ type: 'speech-done' }), // fail open — still listen for a reply
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== 'capturing-confirmation') return;
    awaitingCaptureRef.current = true;
    capture.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // On a yes: file it through the same offline-first path report-hazard.tsx already uses — the
  // queue write happens before the network call, so a dropped connection never loses the report.
  useEffect(() => {
    if (state.phase !== 'filing') return;
    const { parsed, origin } = state;

    async function file(): Promise<void> {
      const request: ReportHazardRequest = {
        id: hazardReportIdSchema.parse(Crypto.randomUUID()),
        type: parsed.type,
        location: origin,
        note: parsed.note,
        measurement: parsed.measurement,
        source: 'voice',
      };
      try {
        await enqueueHazardReport(request);
      } catch {
        dispatch({ type: 'file-failed' });
        return;
      }
      reportMutation.mutate(request, {
        onSuccess: () => {
          void removeQueuedHazardReport(request.id);
          dispatch({ type: 'file-succeeded' });
        },
        // Left in the local queue — useHazardQueueFlush retries automatically once back online,
        // same as the tap flow.
        onError: () => dispatch({ type: 'file-failed' }),
      });
    }

    void file();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Never lose what the driver said (AGENTS.md: "Voice reports are never filed publicly without
  // driver confirmation") — save it for review later when parked (M7.4's screen).
  useEffect(() => {
    if (state.phase !== 'draft-saved') return;
    void saveVoiceHazardDraft({
      transcript: state.transcript,
      parsed: state.parsed,
      origin: fallbackOriginRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  return {
    state,
    start: () => {
      dispatch({ type: 'start' });
      awaitingCaptureRef.current = true;
      capture.start();
    },
    reset: () => {
      awaitingCaptureRef.current = false;
      capture.reset();
      dispatch({ type: 'reset' });
    },
  };
}
