import { act, renderHook } from '@testing-library/react-native';

import { useCollapsingNotice } from './use-collapsing-notice';

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

const OPEN_MS = 12_000;

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('useCollapsingNotice', () => {
  it('shows nothing without a key, then opens a notice once and calls onAppear once', async () => {
    const onAppear = jest.fn();
    const { result, rerender } = await renderHook(
      ({ noticeKey }: { noticeKey: string | undefined }) =>
        useCollapsingNotice(noticeKey, { autoCollapseMs: OPEN_MS, onAppear }),
      { initialProps: { noticeKey: undefined as string | undefined } },
    );
    expect(result.current.mode).toBe('hidden');
    expect(onAppear).not.toHaveBeenCalled();

    await rerender({ noticeKey: 'break:later' });
    expect(result.current.mode).toBe('open');
    expect(onAppear).toHaveBeenCalledTimes(1);

    await rerender({ noticeKey: 'break:later' });
    expect(onAppear).toHaveBeenCalledTimes(1);
  });

  it('shrinks to a flag after the open time, opens again from the flag, and shrinks again', async () => {
    const { result } = await renderHook(() =>
      useCollapsingNotice('break:later', { autoCollapseMs: OPEN_MS }),
    );
    expect(result.current.mode).toBe('open');
    await advance(OPEN_MS - 1);
    expect(result.current.mode).toBe('open');
    await advance(1);
    expect(result.current.mode).toBe('flag');

    await act(async () => result.current.expand());
    expect(result.current.mode).toBe('open');
    await advance(OPEN_MS);
    expect(result.current.mode).toBe('flag');
  });

  it('stays dismissed for the same key, and comes back (and calls onAppear) for a new one', async () => {
    const onAppear = jest.fn();
    const { result, rerender } = await renderHook(
      ({ noticeKey }: { noticeKey: string }) =>
        useCollapsingNotice(noticeKey, { autoCollapseMs: OPEN_MS, onAppear }),
      { initialProps: { noticeKey: 'break:later' } },
    );
    await act(async () => result.current.dismiss());
    expect(result.current.mode).toBe('hidden');
    await advance(OPEN_MS * 3);
    expect(result.current.mode).toBe('hidden');

    await rerender({ noticeKey: 'break:soon' });
    expect(result.current.mode).toBe('open');
    expect(onAppear).toHaveBeenCalledTimes(2);
  });
});
