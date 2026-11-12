import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { getAnnouncementPreference, setAnnouncementPreference } from '../api/announcements';
import { useAuthStore } from '../state/auth-store';
import { useAnnouncementPreference } from './use-announcement-preference';

jest.mock('../api/announcements');

const get = jest.mocked(getAnnouncementPreference);
const set = jest.mocked(setAnnouncementPreference);
const driver = { id: 'd1', identifier: 'a@example.com', createdAt: '2026-11-01T00:00:00.000Z' };

let client = new QueryClient();
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  get.mockReset();
  set.mockReset();
  useAuthStore.setState({
    state: { status: 'signedIn', accessToken: 'token-1', refreshToken: 'r', driver },
  });
});

describe('the choice about notifications from WagonWise', () => {
  it('shows on while it loads, since that is the default, then what the server says', async () => {
    get.mockResolvedValue(false);
    const { result } = await renderHook(() => useAnnouncementPreference(), { wrapper });
    expect(result.current.pushes).toBe(true);
    await waitFor(() => expect(result.current.pushes).toBe(false));
    expect(get).toHaveBeenCalledWith('token-1');
  });

  it('shows a change at once and sends it', async () => {
    get.mockResolvedValue(true);
    set.mockResolvedValue(false);
    const { result } = await renderHook(() => useAnnouncementPreference(), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalled());
    get.mockResolvedValue(false);
    await act(async () => {
      result.current.setPushes(false);
    });
    expect(set).toHaveBeenCalledWith('token-1', false);
    await waitFor(() => expect(result.current.pushes).toBe(false));
  });

  it('puts the switch back and says so when the change does not save', async () => {
    get.mockResolvedValue(true);
    set.mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() => useAnnouncementPreference(), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalled());
    await act(async () => {
      result.current.setPushes(false);
    });
    await waitFor(() => expect(result.current.failed).toBe(true));
    await waitFor(() => expect(result.current.pushes).toBe(true));
  });

  it('does not ask before the sign-in has a token', async () => {
    useAuthStore.setState({
      state: { status: 'signedIn', accessToken: '', refreshToken: 'r', driver },
    });
    const { result } = await renderHook(() => useAnnouncementPreference(), { wrapper });
    expect(result.current.pushes).toBe(true);
    expect(get).not.toHaveBeenCalled();
  });
});
