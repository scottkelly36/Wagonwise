import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { COLLAPSE_AFTER_MS, HoursQuickBar } from './hours-quick-bar';

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

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

describe('HoursQuickBar', () => {
  it('shows the clock, shrinks to a small button after a while, and opens again from it', async () => {
    await render(<HoursQuickBar />);
    expect(screen.getByTestId('hours-quick-toggle')).toBeTruthy();

    await advance(COLLAPSE_AFTER_MS - 1);
    expect(screen.queryByTestId('hours-quick-chip')).toBeNull();
    await advance(1);
    expect(screen.queryByTestId('hours-quick-toggle')).toBeNull();
    expect(screen.getByTestId('hours-quick-chip')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('hours-quick-chip'));
    expect(screen.getByTestId('hours-quick-toggle')).toBeTruthy();
    await advance(COLLAPSE_AFTER_MS);
    expect(screen.getByTestId('hours-quick-chip')).toBeTruthy();
  });

  it('does not shrink while the four buttons are open, and waits again after a tap', async () => {
    await render(<HoursQuickBar />);
    await advance(COLLAPSE_AFTER_MS - 2_000);
    await fireEvent.press(screen.getByTestId('hours-quick-toggle'));
    expect(screen.getByTestId('quick-driving')).toBeTruthy();

    await advance(COLLAPSE_AFTER_MS * 3);
    expect(screen.getByTestId('hours-quick-toggle')).toBeTruthy();
    expect(screen.queryByTestId('hours-quick-chip')).toBeNull();
  });
});
