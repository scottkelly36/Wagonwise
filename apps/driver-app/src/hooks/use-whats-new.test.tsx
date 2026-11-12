import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { AnnouncementDto } from '@wagonwise/contracts/announcements';
import type { ReactNode } from 'react';

import { getLatestAnnouncement } from '../api/announcements';
import { useAuthStore } from '../state/auth-store';
import { useWhatsNewStore } from '../state/whats-new-store';
import { useWhatsNew } from './use-whats-new';

jest.mock('../api/announcements');
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
}));
let mockUpdatePending = false;
jest.mock('expo-updates', () => ({
  useUpdates: () => ({ isUpdatePending: mockUpdatePending }),
}));

const latest = jest.mocked(getLatestAnnouncement);
const driver = { id: 'd1', identifier: 'a@example.com', createdAt: '2026-11-01T00:00:00.000Z' };

const note = (): AnnouncementDto => ({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Choose your route on a job',
  body: 'Start on a job opens the route cards.',
  publishedAt: new Date().toISOString(),
});

let client = new QueryClient();
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  latest.mockReset();
  mockUpdatePending = false;
  useWhatsNewStore.setState({ seenId: undefined, restored: true });
  useAuthStore.setState({
    state: { status: 'signedIn', accessToken: 'token-1', refreshToken: 'r', driver },
  });
});

describe('the note shown on the home screen', () => {
  it('shows the newest note once it has been fetched', async () => {
    latest.mockResolvedValue(note());
    const { result } = await renderHook(() => useWhatsNew(), { wrapper });
    await waitFor(() =>
      expect(result.current.announcement?.title).toBe('Choose your route on a job'),
    );
    expect(latest).toHaveBeenCalledWith('token-1');
  });

  it('is gone for good once the driver says Got it', async () => {
    latest.mockResolvedValue(note());
    const { result } = await renderHook(() => useWhatsNew(), { wrapper });
    await waitFor(() => expect(result.current.announcement).toBeDefined());
    await act(async () => {
      result.current.dismiss();
    });
    expect(useWhatsNewStore.getState().seenId).toBe(note().id);
    await waitFor(() => expect(result.current.announcement).toBeUndefined());
  });

  it('shows nothing until the phone has said what was already seen, so a seen note is not flashed', async () => {
    useWhatsNewStore.setState({ restored: false });
    latest.mockResolvedValue(note());
    const { result } = await renderHook(() => useWhatsNew(), { wrapper });
    await waitFor(() => expect(latest).toHaveBeenCalled());
    expect(result.current.announcement).toBeUndefined();
  });

  it('shows nothing while an update waits for a restart', async () => {
    mockUpdatePending = true;
    latest.mockResolvedValue(note());
    const { result } = await renderHook(() => useWhatsNew(), { wrapper });
    await waitFor(() => expect(latest).toHaveBeenCalled());
    expect(result.current.announcement).toBeUndefined();
  });

  it('does not ask, or show anything, with no sign-in token yet or when it cannot ask', async () => {
    useAuthStore.setState({
      state: { status: 'signedIn', accessToken: '', refreshToken: 'r', driver },
    });
    const { result } = await renderHook(() => useWhatsNew(), { wrapper });
    expect(latest).not.toHaveBeenCalled();
    expect(result.current.announcement).toBeUndefined();

    useAuthStore.setState({
      state: { status: 'signedIn', accessToken: 'token-1', refreshToken: 'r', driver },
    });
    latest.mockRejectedValue(new Error('offline'));
    const second = await renderHook(() => useWhatsNew(), { wrapper });
    await waitFor(() => expect(latest).toHaveBeenCalled());
    expect(second.result.current.announcement).toBeUndefined();
  });
});
