import type { HazardTypeDto } from '@wagonwise/contracts/hazards';

import { HAZARD_TYPE_LABELS } from './hazard-labels';
import type { YesNoAnswer } from './yes-no-parser';

/**
 * The spoken "was it still there?" after passing a hazard: ask, wait for the question to finish being said, listen, then act on
 * the answer. One hazard at a time; the rules for which hazards and how many live in `hazard-still-there.ts`.
 */
export type StillThereState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'asking'; readonly hazardId: string; readonly type: HazardTypeDto }
  | { readonly phase: 'listening'; readonly hazardId: string; readonly type: HazardTypeDto };

export type StillThereEvent =
  | { readonly type: 'ask'; readonly hazardId: string; readonly hazardType: HazardTypeDto }
  | { readonly type: 'prompt-spoken' }
  | { readonly type: 'heard' }
  | { readonly type: 'stop' };

export const INITIAL_STILL_THERE_STATE: StillThereState = { phase: 'idle' };

export function stillThereReducer(state: StillThereState, event: StillThereEvent): StillThereState {
  switch (event.type) {
    case 'ask':
      return state.phase === 'idle'
        ? { phase: 'asking', hazardId: event.hazardId, type: event.hazardType }
        : state;
    case 'prompt-spoken':
      return state.phase === 'asking' ? { ...state, phase: 'listening' } : state;
    case 'heard':
    case 'stop':
      return INITIAL_STILL_THERE_STATE;
  }
}

/** What is said: the kind of hazard, then the question. */
export function stillThereQuestion(type: HazardTypeDto): string {
  return `${HAZARD_TYPE_LABELS[type]}: was it still there? Say yes or no.`;
}

/** What is done with the answer. Silence or an unclear answer does nothing: the question is not repeated. */
export function actionFor(answer: YesNoAnswer): 'confirm' | 'dismiss' | 'nothing' {
  if (answer === 'yes') return 'confirm';
  if (answer === 'no') return 'dismiss';
  return 'nothing';
}

export function thanksFor(action: 'confirm' | 'dismiss' | 'nothing'): string | undefined {
  if (action === 'confirm') return 'Thanks.';
  if (action === 'dismiss') return 'Thanks, noted.';
  return undefined;
}
