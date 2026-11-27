import { act, renderHook, waitFor } from '@testing-library/react-native';

import { CardError } from '../lib/tachograph-card/errors';
import { SCENARIOS } from '../lib/tachograph-card/scenarios';
import { SimulatedCard } from '../lib/tachograph-card/simulated-card';
import { useCardRead } from './use-card-read';

const scenario = (id: string) => {
  const found = SCENARIOS.find((s) => s.id === id);
  if (found === undefined) throw new Error(id);
  return found;
};

describe('useCardRead', () => {
  it('reads a good pretend card to the end and gives the summary', async () => {
    const { result } = await renderHook(() => useCardRead(0));
    expect(result.current.state.status).toBe('idle');
    await act(async () => {
      await result.current.start(scenario('good'));
    });
    expect(result.current.state.status).toBe('done');
    if (result.current.state.status === 'done') {
      expect(result.current.state.summary.files).toHaveLength(16);
    }
  });

  it('says in plain words what went wrong, not a status code', async () => {
    const { result } = await renderHook(() => useCardRead(0));
    await act(async () => {
      await result.current.start(scenario('none'));
    });
    expect(result.current.state).toEqual({
      status: 'failed',
      message: 'No card in the reader. Put your driver card in, chip first, and try again.',
    });
  });

  it('goes back to idle when stopped part way', async () => {
    const { result } = await renderHook(() => useCardRead(5));
    let finished: Promise<void> | undefined;
    await act(async () => {
      finished = result.current.start(scenario('good'));
    });
    await waitFor(() => expect(result.current.state.status).toBe('reading'));
    await act(async () => {
      result.current.cancel();
      await finished;
    });
    expect(result.current.state.status).toBe('idle');
  });

  it('lets a new read replace one in progress without the old one spoiling it', async () => {
    const { result } = await renderHook(() => useCardRead(2));
    let first: Promise<void> | undefined;
    await act(async () => {
      first = result.current.start(scenario('good'));
    });
    await waitFor(() => expect(result.current.state.status).toBe('reading'));
    await act(async () => {
      await result.current.start(scenario('workshop'));
      await first;
    });
    expect(result.current.state.status).toBe('failed');
  });

  describe('with a real reader', () => {
    it('keeps the file and a log, and the log has no card data in it', async () => {
      const open = async (note: (line: string) => void) => {
        note('opened 072f:1205');
        return new SimulatedCard();
      };
      const { result } = await renderHook(() => useCardRead(0, open));
      await act(async () => {
        await result.current.startReal();
      });
      expect(result.current.state.status).toBe('done');
      expect(result.current.download?.ddd.length).toBeGreaterThan(1000);
      expect(result.current.download?.fileName).toMatch(/^C_\d{8}_\d{4}\.DDD$/);
      expect(result.current.log[0]).toBe('opened 072f:1205');
      expect(result.current.log.join(' ')).not.toMatch(/SIMULATED/);
      await act(async () => {
        result.current.reset();
      });
      expect(result.current.download).toBeUndefined();
      expect(result.current.log).toHaveLength(0);
    });

    it('says plainly when there is no reader, and still gives the log', async () => {
      const open = async (note: (line: string) => void): Promise<SimulatedCard> => {
        note('the phone sees no USB devices');
        throw new CardError('no_reader', 'no USB card reader plugged in');
      };
      const { result } = await renderHook(() => useCardRead(0, open));
      await act(async () => {
        await result.current.startReal();
      });
      expect(result.current.state).toEqual({
        status: 'failed',
        message: 'No card reader found. Plug your reader into the phone and try again.',
      });
      expect(result.current.download).toBeUndefined();
      expect(result.current.log.at(-1)).toBe('stopped: no_reader: no USB card reader plugged in');
    });

    it('keeps a file from a pretend card too, named so it cannot be taken for a real one', async () => {
      const { result } = await renderHook(() => useCardRead(0));
      await act(async () => {
        await result.current.start(scenario('good'));
      });
      expect(result.current.state.status).toBe('done');
      expect(result.current.download?.fileName).toMatch(/^PRETEND_C_\d{8}_\d{4}\.DDD$/);
    });
  });
});
