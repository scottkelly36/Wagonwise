import type { HazardTypeDto } from '@wagonwise/contracts/hazards';
import * as Speech from 'expo-speech';
import { useEffect, useReducer, useRef } from 'react';

import { useConfirmHazard, useDismissHazard } from '../api/use-hazards';
import {
  aheadMetres,
  markAsked,
  NOTHING_PASSED,
  passedHazards,
  type PassingState,
} from '../lib/hazard-still-there';
import type { RoutePoint } from '../lib/route-progress';
import {
  actionFor,
  INITIAL_STILL_THERE_STATE,
  stillThereQuestion,
  stillThereReducer,
  thanksFor,
} from '../lib/still-there-reducer';
import { parseYesNo } from '../lib/yes-no-parser';
import { useVoiceReportCapture } from './use-voice-report-capture';

export interface StillThereHazard {
  readonly id: string;
  readonly location: RoutePoint;
  readonly type: HazardTypeDto;
}

function speak(text: string, onDone?: () => void): void {
  Speech.speak(text, { language: 'en-GB', onDone, onError: onDone });
}

/**
 * After the driver passes a hazard they were warned about (150 m past it), asks aloud whether it was still there and listens for a
 * yes or no: yes confirms it, no counts as one "not there" (it takes several more of those than yes answers to hide a hazard).
 * Silence or an unclear answer does nothing and the question is not repeated. At most three questions a trip, one at a time, and
 * never over another voice (a turn instruction, a voice report). Mounted for one trip, so a new trip starts clean.
 *
 * `enabled` is false when the driver has turned the questions off, muted the voice, or the mic is in use for something else.
 * `busy` is true from the question until the answer is dealt with, so the screen can keep other voice buttons out of the way.
 */
export function useHazardStillThere(
  routeLine: readonly (readonly [number, number])[] | undefined,
  position: RoutePoint | undefined,
  hazards: readonly StillThereHazard[] | undefined,
  enabled: boolean,
): { readonly busy: boolean } {
  const [state, dispatch] = useReducer(stillThereReducer, INITIAL_STILL_THERE_STATE);
  const capture = useVoiceReportCapture();
  const confirm = useConfirmHazard();
  const dismiss = useDismissHazard();

  const passing = useRef<PassingState>(NOTHING_PASSED);
  const questionsAsked = useRef(0);
  const awaitingCapture = useRef(false);
  const micRefused = useRef(false);
  const hazardsRef = useRef(hazards);
  useEffect(() => {
    hazardsRef.current = hazards;
  });

  // Look for a hazard just passed, whenever the position moves, and ask about it if it is a quiet moment.
  useEffect(() => {
    if (!routeLine || !position || !hazards || hazards.length === 0) return;
    const result = passedHazards(
      passing.current,
      aheadMetres(routeLine, position, hazards),
      questionsAsked.current,
    );
    passing.current = result.state;
    const nextId = result.due[0];
    if (nextId === undefined || !enabled || micRefused.current) return;
    if (state.phase !== 'idle') return;
    const hazard = hazards.find((h) => h.id === nextId);
    if (hazard === undefined) return;

    let cancelled = false;
    void Speech.isSpeakingAsync().then((speaking) => {
      if (cancelled) return;
      // Something else is being said: leave it. The next position update tries again.
      if (speaking) return;
      passing.current = markAsked(passing.current, nextId);
      questionsAsked.current += 1;
      dispatch({ type: 'ask', hazardId: hazard.id, hazardType: hazard.type });
    });
    return () => {
      cancelled = true;
    };
  }, [routeLine, position, hazards, enabled, state.phase]);

  // Say the question, then listen.
  useEffect(() => {
    if (state.phase !== 'asking') return;
    speak(stillThereQuestion(state.type), () => dispatch({ type: 'prompt-spoken' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== 'listening') return;
    awaitingCapture.current = true;
    capture.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Act on what was heard.
  useEffect(() => {
    if (!awaitingCapture.current || state.phase !== 'listening') return;
    const { status, transcript } = capture.state;
    if (status === 'idle' || status === 'starting' || status === 'listening') return;
    awaitingCapture.current = false;

    if (status === 'permission-denied') {
      micRefused.current = true; // do not nag a driver who has the mic off
      dispatch({ type: 'heard' });
      return;
    }
    const answer = status === 'transcribed' ? parseYesNo(transcript ?? '') : 'unclear';
    const action = actionFor(answer);
    if (action === 'confirm') confirm.mutate(state.hazardId);
    if (action === 'dismiss') dismiss.mutate(state.hazardId);
    const thanks = thanksFor(action);
    if (thanks !== undefined) speak(thanks);
    dispatch({ type: 'heard' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture.state]);

  // Leaving the trip mid-question must not leave the phone talking or listening.
  useEffect(
    () => () => {
      awaitingCapture.current = false;
      capture.cancel();
      void Speech.stop();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { busy: state.phase !== 'idle' };
}
