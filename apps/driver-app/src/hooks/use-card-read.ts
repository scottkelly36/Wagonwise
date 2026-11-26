import { useCallback, useEffect, useReducer, useRef } from 'react';

import { cardReadReducer, summarise, withDelay } from '../lib/tachograph-card/card-flow';
import { downloadDriverCard } from '../lib/tachograph-card/download-card';
import { CardError, cardErrorText } from '../lib/tachograph-card/errors';
import type { Scenario } from '../lib/tachograph-card/scenarios';
import { SimulatedCard } from '../lib/tachograph-card/simulated-card';

/** Pause before each command so the progress can be watched; a real card is slow too. */
export const DEFAULT_STEP_DELAY_MS = 25;

/**
 * Runs a read of a pretend card for the test screen and says where it has got to. It uses the simulated card only, so nothing leaves the
 * phone. When a real reader exists this is where it is chosen instead.
 */
export function useCardRead(stepDelayMs: number = DEFAULT_STEP_DELAY_MS) {
  const [state, dispatch] = useReducer(cardReadReducer, { status: 'idle' });
  const controller = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(
    async (scenario: Scenario) => {
      controller.current?.abort();
      const stop = new AbortController();
      controller.current = stop;
      dispatch({ type: 'start' });
      try {
        const reader = withDelay(new SimulatedCard(scenario.options), stepDelayMs);
        const result = await downloadDriverCard(reader, {
          signal: stop.signal,
          onProgress: (p) => {
            if (controller.current === stop) dispatch({ type: 'progress', ...p });
          },
        });
        // A newer read has replaced this one: leave the screen to it.
        if (controller.current === stop) dispatch({ type: 'done', summary: summarise(result) });
      } catch (error) {
        if (controller.current !== stop) return;
        if (error instanceof CardError && error.code === 'cancelled') {
          dispatch({ type: 'reset' });
        } else {
          dispatch({ type: 'failed', message: cardErrorText(error) });
        }
      }
    },
    [stepDelayMs],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);
  const reset = useCallback(() => {
    controller.current?.abort();
    dispatch({ type: 'reset' });
  }, []);

  return { state, start, cancel, reset };
}
