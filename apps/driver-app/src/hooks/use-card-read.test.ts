import { act, renderHook, waitFor } from '@testing-library/react-native';

import { SCENARIOS } from '../lib/tachograph-card/scenarios';
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
});
