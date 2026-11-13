import { act, renderHook } from '@testing-library/react-native';

import { getAppVersionInfo } from '../api/app-version';
import { useConnectionStore } from '../state/connection-store';
import { PROBE_EVERY_MS, useConnectionProbe } from './use-connection-probe';

jest.mock('../api/app-version', () => ({
  getAppVersionInfo: jest.fn().mockResolvedValue({}),
}));

const probe = jest.mocked(getAppVersionInfo);

beforeEach(() => {
  jest.useFakeTimers();
  probe.mockClear();
  useConnectionStore.setState({ offline: false });
});
afterEach(() => jest.useRealTimers());

describe('the connection probe', () => {
  it('does nothing while online', async () => {
    await renderHook(() => useConnectionProbe());
    jest.advanceTimersByTime(PROBE_EVERY_MS * 3);
    expect(probe).not.toHaveBeenCalled();
  });

  it('tries every few seconds while offline, and stops once online again', async () => {
    useConnectionStore.setState({ offline: true });
    await renderHook(() => useConnectionProbe());
    jest.advanceTimersByTime(PROBE_EVERY_MS * 2);
    expect(probe).toHaveBeenCalledTimes(2);

    await act(async () => useConnectionStore.getState().setOffline(false));
    probe.mockClear();
    jest.advanceTimersByTime(PROBE_EVERY_MS * 2);
    expect(probe).not.toHaveBeenCalled();
  });
});
