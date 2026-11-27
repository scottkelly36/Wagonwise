import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import {
  cardReadReducer,
  condenseLog,
  summarise,
  withDelay,
} from '../lib/tachograph-card/card-flow';
import { downloadDriverCard } from '../lib/tachograph-card/download-card';
import { CardError, cardErrorText } from '../lib/tachograph-card/errors';
import type { CardReader } from '../lib/tachograph-card/reader';
import type { Scenario } from '../lib/tachograph-card/scenarios';
import { SimulatedCard } from '../lib/tachograph-card/simulated-card';
import { createUsbReaderProvider, usbReaderNative } from '../lib/tachograph-card/usb-reader';

/** Pause before each command so the progress can be watched; a real card is slow too. */
export const DEFAULT_STEP_DELAY_MS = 25;

/** A pretend card's file is named with this first, so it can never be mistaken for a real one wherever it ends up. */
export const PRETEND_FILE_PREFIX = 'PRETEND_';

/** The card's file, as read from a real reader or a pretend card: kept in memory until the driver shares it or leaves the screen. */
export interface CardDownload {
  readonly ddd: Uint8Array;
  readonly fileName: string;
}

/** Opens the phone's USB card reader, telling `log` what happened. The default uses the native module; a test passes its own. */
export type OpenUsbReader = (log: (line: string) => void) => Promise<CardReader>;

const openUsbReader: OpenUsbReader = async (log) => {
  const native = usbReaderNative();
  if (native === null) throw new CardError('no_reader', 'this build has no USB reader support');
  return createUsbReaderProvider(native, log).open();
};

/**
 * Runs a read of a card for the test screen and says where it has got to: of a pretend card (nothing real is read and nothing leaves
 * the phone), or of a real one in a USB reader plugged into the phone. A read keeps the file it made, for the driver to upload or share if
 * they choose (a pretend one is named PRETEND_, so the upload can be tried without a card); a real read also keeps a log of what the
 * reader and card said (never what is on the card). Neither goes anywhere by itself.
 */
export function useCardRead(
  stepDelayMs: number = DEFAULT_STEP_DELAY_MS,
  openUsb: OpenUsbReader = openUsbReader,
) {
  const [state, dispatch] = useReducer(cardReadReducer, { status: 'idle' });
  const [log, setLog] = useState<readonly string[]>([]);
  const [download, setDownload] = useState<CardDownload | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(
    async (
      makeReader: (note: (line: string) => void) => Promise<CardReader>,
      namePrefix: string,
    ) => {
      controller.current?.abort();
      const stop = new AbortController();
      controller.current = stop;
      const lines: string[] = [];
      const note = (line: string) => lines.push(line);
      setLog([]);
      setDownload(undefined);
      dispatch({ type: 'start' });
      try {
        const reader = await makeReader(note);
        const result = await downloadDriverCard(reader, {
          signal: stop.signal,
          onProgress: (p) => {
            note(`reading ${p.file} (${p.step} of ${p.steps})`);
            if (controller.current === stop) dispatch({ type: 'progress', ...p });
          },
        });
        // A newer read has replaced this one: leave the screen to it.
        if (controller.current !== stop) return;
        const summary = summarise(result);
        note(`done: ${summary.files.length} parts, ${summary.totalBytes} bytes`);
        setLog(condenseLog(lines));
        setDownload({ ddd: result.ddd, fileName: `${namePrefix}${summary.fileName}` });
        dispatch({ type: 'done', summary });
      } catch (error) {
        if (controller.current !== stop) return;
        note(
          error instanceof CardError
            ? `stopped: ${error.code}: ${error.message}`
            : `stopped: ${error instanceof Error ? error.message : String(error)}`,
        );
        setLog(condenseLog(lines));
        if (error instanceof CardError && error.code === 'cancelled') {
          dispatch({ type: 'reset' });
        } else {
          dispatch({ type: 'failed', message: cardErrorText(error) });
        }
      }
    },
    [],
  );

  const start = useCallback(
    (scenario: Scenario) =>
      run(
        async () => withDelay(new SimulatedCard(scenario.options), stepDelayMs),
        PRETEND_FILE_PREFIX,
      ),
    [run, stepDelayMs],
  );

  const startReal = useCallback(() => run((note) => openUsb(note), ''), [run, openUsb]);

  const cancel = useCallback(() => controller.current?.abort(), []);
  const reset = useCallback(() => {
    controller.current?.abort();
    setLog([]);
    setDownload(undefined);
    dispatch({ type: 'reset' });
  }, []);

  return { state, start, startReal, cancel, reset, log, download };
}
