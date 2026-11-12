import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { refreshPendingArrivals, syncTripOutbox } from '../hooks/use-trip-outbox-flush';
import { useAuthStore } from '../state/auth-store';
import { usePendingArrivalsStore } from '../state/pending-arrivals-store';
import { WaitingForSignalNotice } from './waiting-for-signal-notice';

jest.mock('../hooks/use-trip-outbox-flush', () => ({
  syncTripOutbox: jest.fn().mockResolvedValue(undefined),
  refreshPendingArrivals: jest.fn().mockResolvedValue(undefined),
}));

jest.setTimeout(30_000);

const driver = { id: 'd1', identifier: 'a@example.com', createdAt: '2026-11-01T00:00:00.000Z' };
const sync = jest.mocked(syncTripOutbox);
const refresh = jest.mocked(refreshPendingArrivals);
const SAVED = 'Your trip end is saved. It will be sent when you have signal.';

beforeEach(() => {
  sync.mockReset().mockResolvedValue(undefined);
  refresh.mockReset().mockResolvedValue(undefined);
  usePendingArrivalsStore.setState({ advances: {}, waiting: undefined });
  useAuthStore.setState({
    state: { status: 'signedIn', accessToken: 'token-1', refreshToken: 'r', driver },
  });
});

describe('the waiting-for-signal notice', () => {
  it('shows nothing when nothing is saved', async () => {
    await render(<WaitingForSignalNotice />);
    expect(screen.queryByTestId('waiting-for-signal')).toBeNull();
  });

  it('says what is saved and that it will go when there is signal', async () => {
    usePendingArrivalsStore.setState({ waiting: SAVED });
    await render(<WaitingForSignalNotice />);
    expect(screen.getByTestId('waiting-for-signal-message').props.children).toBe(SAVED);
    expect(screen.queryByTestId('waiting-for-signal-still')).toBeNull();
  });

  it('goes by itself once it has been sent', async () => {
    usePendingArrivalsStore.setState({ waiting: SAVED });
    await render(<WaitingForSignalNotice />);
    await act(async () => {
      usePendingArrivalsStore.setState({ waiting: undefined });
    });
    expect(screen.queryByTestId('waiting-for-signal')).toBeNull();
  });

  it('tries at once on Send now, and says there is still no signal when it stays saved', async () => {
    usePendingArrivalsStore.setState({ waiting: SAVED });
    await render(<WaitingForSignalNotice />);
    await fireEvent.press(screen.getByTestId('waiting-for-signal-send'));

    expect(sync).toHaveBeenCalledWith('token-1');
    expect(refresh).toHaveBeenCalled();
    expect(await screen.findByTestId('waiting-for-signal-still')).toBeTruthy();
  });

  it('clears when Send now gets it through', async () => {
    usePendingArrivalsStore.setState({ waiting: SAVED });
    refresh.mockImplementation(async () => {
      usePendingArrivalsStore.setState({ waiting: undefined });
    });
    await render(<WaitingForSignalNotice />);
    await fireEvent.press(screen.getByTestId('waiting-for-signal-send'));
    expect(sync).toHaveBeenCalled();
    expect(screen.queryByTestId('waiting-for-signal')).toBeNull();
  });

  it('says there is still no signal when trying fails outright', async () => {
    usePendingArrivalsStore.setState({ waiting: SAVED });
    sync.mockRejectedValue(new Error('offline'));
    await render(<WaitingForSignalNotice />);
    await fireEvent.press(screen.getByTestId('waiting-for-signal-send'));
    expect(await screen.findByTestId('waiting-for-signal-still')).toBeTruthy();
  });
});
