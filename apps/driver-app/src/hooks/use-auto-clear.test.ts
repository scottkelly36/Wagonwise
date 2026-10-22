import { act, renderHook } from '@testing-library/react-native';

import { useAutoClear } from './use-auto-clear';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('useAutoClear', () => {
  it('clears once, after the delay, when it becomes active', async () => {
    const clear = jest.fn();
    const { rerender } = await renderHook(
      ({ active }: { active: boolean }) => useAutoClear(active, 6_000, clear),
      { initialProps: { active: false } },
    );
    await advance(10_000);
    expect(clear).not.toHaveBeenCalled();

    await rerender({ active: true });
    await advance(5_999);
    expect(clear).not.toHaveBeenCalled();
    await advance(1);
    expect(clear).toHaveBeenCalledTimes(1);
    await advance(20_000);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('does not clear if it goes inactive first', async () => {
    const clear = jest.fn();
    const { rerender } = await renderHook(
      ({ active }: { active: boolean }) => useAutoClear(active, 6_000, clear),
      { initialProps: { active: true } },
    );
    await advance(3_000);
    await rerender({ active: false });
    await advance(10_000);
    expect(clear).not.toHaveBeenCalled();
  });

  it('starts the wait again when the message changes', async () => {
    const clear = jest.fn();
    const { rerender } = await renderHook(
      ({ key }: { key: string }) => useAutoClear(true, 6_000, clear, key),
      { initialProps: { key: 'filed' } },
    );
    await advance(4_000);
    await rerender({ key: 'error' });
    await advance(4_000);
    expect(clear).not.toHaveBeenCalled();
    await advance(2_000);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('uses the latest clear function', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = await renderHook(
      ({ fn }: { fn: () => void }) => useAutoClear(true, 1_000, fn),
      { initialProps: { fn: first } },
    );
    await rerender({ fn: second });
    await advance(1_000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
