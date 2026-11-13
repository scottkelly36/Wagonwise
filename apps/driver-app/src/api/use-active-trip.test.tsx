import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ActiveTripDto, RoutePlanDto } from '@wagonwise/contracts/routing';
import type { ReactNode } from 'react';

import { clearSavedTrip, loadSavedTrip, type SavedTrip } from '../db/saved-trip';
import { listPendingTripEnds } from '../db/trip-outbox';
import { queueTripEnd, syncTripOutbox } from '../hooks/use-trip-outbox-flush';
import { ApiError } from './errors';
import * as jobsApi from './jobs';
import * as routingApi from './routing';
import { useArriveAtStop, useEndTrip, useResumeActiveTrip, useStartTrip } from './use-active-trip';

jest.mock('./routing');
jest.mock('./jobs');
jest.mock('../db/saved-trip');
jest.mock('../db/trip-outbox');
jest.mock('../hooks/use-trip-outbox-flush', () => ({
  queueTripEnd: jest.fn().mockResolvedValue(undefined),
  syncTripOutbox: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../hooks/use-access-token', () => ({ useAccessToken: () => 'token-1' }));

const routing = jest.mocked(routingApi);
const jobs = jest.mocked(jobsApi);

const offline = () => new TypeError('Network request failed');
const refused = (tag: string, status: number) => new ApiError(tag, status);

let client = new QueryClient();
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false, gcTime: 0 } },
  });
  for (const m of [
    routing.endTrip,
    routing.startTrip,
    routing.getActiveTrip,
    routing.getRoutePlan,
    jobs.advanceJobStatus,
    jest.mocked(loadSavedTrip),
    jest.mocked(clearSavedTrip),
    jest.mocked(listPendingTripEnds),
    jest.mocked(queueTripEnd),
    jest.mocked(syncTripOutbox),
  ]) {
    m.mockReset();
  }
  jest.mocked(clearSavedTrip).mockResolvedValue(undefined);
  jest.mocked(queueTripEnd).mockResolvedValue(undefined);
  jest.mocked(syncTripOutbox).mockResolvedValue(undefined);
  jest.mocked(listPendingTripEnds).mockResolvedValue([]);
  jest.mocked(loadSavedTrip).mockResolvedValue(undefined);
});

describe('End trip', () => {
  async function end() {
    const { result } = await renderHook(() => useEndTrip(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('trip-1');
    });
  }

  it('ends the trip on the server when it can', async () => {
    routing.endTrip.mockResolvedValue({} as ActiveTripDto);
    await end();
    expect(routing.endTrip).toHaveBeenCalledWith('token-1', 'trip-1');
    expect(queueTripEnd).not.toHaveBeenCalled();
  });

  it('saves the end to send later when there is no signal, and still succeeds', async () => {
    routing.endTrip.mockRejectedValue(offline());
    await end();
    expect(queueTripEnd).toHaveBeenCalledWith({
      tripId: 'trip-1',
      endedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('saves it when the server is down or the token is about to refresh', async () => {
    for (const status of [500, 401]) {
      jest.mocked(queueTripEnd).mockClear();
      routing.endTrip.mockRejectedValue(refused('Oops', status));
      await end();
      expect(queueTripEnd).toHaveBeenCalledTimes(1);
    }
  });

  it('finishes quietly when the server has no such trip any more', async () => {
    routing.endTrip.mockRejectedValue(refused('ActiveTripNotFound', 404));
    await end();
    expect(queueTripEnd).not.toHaveBeenCalled();
  });

  it('shows a refusal the server will always give, and saves nothing', async () => {
    routing.endTrip.mockRejectedValue(refused('Forbidden', 403));
    const { result } = await renderHook(() => useEndTrip(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync('trip-1')).rejects.toBeInstanceOf(ApiError);
    });
    expect(queueTripEnd).not.toHaveBeenCalled();
  });
});

describe('Arrived on a job', () => {
  const input = { jobId: 'job-1', status: 'at_delivery', tripId: 'trip-1' } as const;
  async function arrive() {
    const { result } = await renderHook(() => useArriveAtStop(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
  }

  it('moves the job on and ends the trip', async () => {
    jobs.advanceJobStatus.mockResolvedValue(
      {} as Awaited<ReturnType<typeof jobsApi.advanceJobStatus>>,
    );
    routing.endTrip.mockResolvedValue({} as ActiveTripDto);
    await arrive();
    expect(jobs.advanceJobStatus).toHaveBeenCalledWith('token-1', 'job-1', {
      status: 'at_delivery',
      at: expect.any(String),
    });
    expect(routing.endTrip).toHaveBeenCalledWith('token-1', 'trip-1');
    expect(queueTripEnd).not.toHaveBeenCalled();
  });

  it('saves the arrival and the end together, in that order, when there is no signal', async () => {
    jobs.advanceJobStatus.mockRejectedValue(offline());
    await arrive();
    expect(routing.endTrip).not.toHaveBeenCalled();
    expect(queueTripEnd).toHaveBeenCalledWith({
      tripId: 'trip-1',
      endedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      jobAdvance: { jobId: 'job-1', status: 'at_delivery' },
    });
  });

  it('saves only the end when the arrival reached the server and the end did not', async () => {
    jobs.advanceJobStatus.mockResolvedValue(
      {} as Awaited<ReturnType<typeof jobsApi.advanceJobStatus>>,
    );
    routing.endTrip.mockRejectedValue(offline());
    await arrive();
    expect(queueTripEnd).toHaveBeenCalledWith({
      tripId: 'trip-1',
      endedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('shows a refusal the server will always give for the job, and does not end the trip', async () => {
    jobs.advanceJobStatus.mockRejectedValue(refused('InvalidTransition', 409));
    const { result } = await renderHook(() => useArriveAtStop(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(input)).rejects.toBeInstanceOf(ApiError);
    });
    expect(routing.endTrip).not.toHaveBeenCalled();
    expect(queueTripEnd).not.toHaveBeenCalled();
  });
});

describe('Start trip', () => {
  it('sends what was ended with no signal first, so the server does not still count the old trip', async () => {
    const order: string[] = [];
    jest.mocked(syncTripOutbox).mockImplementation(async () => void order.push('sync'));
    routing.startTrip.mockImplementation(async () => {
      order.push('start');
      return {} as ActiveTripDto;
    });
    const { result } = await renderHook(() => useStartTrip(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('plan-1');
    });
    expect(order).toEqual(['sync', 'start']);
  });

  it('starts anyway when that send fails', async () => {
    jest.mocked(syncTripOutbox).mockRejectedValue(offline());
    routing.startTrip.mockResolvedValue({} as ActiveTripDto);
    const { result } = await renderHook(() => useStartTrip(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('plan-1');
    });
    expect(routing.startTrip).toHaveBeenCalled();
  });
});

describe('opening the app mid-trip', () => {
  const trip = { id: 'trip-1', routePlanId: 'plan-1', driverId: 'driver-1' } as ActiveTripDto;
  const plan = { id: 'plan-1' } as RoutePlanDto;
  const saved = (savedAt = new Date().toISOString()): SavedTrip => ({
    trip: { ...trip, routePlanId: 'plan-saved' } as ActiveTripDto,
    plan: { id: 'plan-saved' } as RoutePlanDto,
    savedAt,
  });

  async function resume(driverId: string | undefined = 'driver-1', token = 'token-1') {
    const { result } = await renderHook(() => useResumeActiveTrip(token, driverId), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    return result.current;
  }

  it('takes the server’s trip and plan when it answers', async () => {
    routing.getActiveTrip.mockResolvedValue(trip);
    routing.getRoutePlan.mockResolvedValue(plan);
    const result = await resume();
    expect(result.data).toEqual({ trip, plan });
    expect(syncTripOutbox).toHaveBeenCalledWith('token-1');
  });

  it('sends what was ended offline before asking, so an ended trip is not brought back', async () => {
    const order: string[] = [];
    jest.mocked(syncTripOutbox).mockImplementation(async () => void order.push('sync'));
    routing.getActiveTrip.mockImplementation(async () => {
      order.push('ask');
      return null;
    });
    await resume();
    expect(order).toEqual(['sync', 'ask']);
  });

  it('clears the saved trip when the server says nothing is in progress', async () => {
    jest.mocked(loadSavedTrip).mockResolvedValue(saved());
    routing.getActiveTrip.mockResolvedValue(null);
    const result = await resume();
    expect(result.data).toBeNull();
    expect(clearSavedTrip).toHaveBeenCalled();
  });

  it('brings back the trip from the phone when there is no signal', async () => {
    jest.mocked(loadSavedTrip).mockResolvedValue(saved());
    routing.getActiveTrip.mockRejectedValue(offline());
    const result = await resume();
    expect(result.data).toMatchObject({ fromPhone: true, trip: { id: 'trip-1' } });
    expect(result.data?.plan.id).toBe('plan-saved');
  });

  it('brings it back when the server errors or the sign-in has not refreshed yet', async () => {
    jest.mocked(loadSavedTrip).mockResolvedValue(saved());
    for (const status of [503, 401]) {
      client.clear();
      routing.getActiveTrip.mockRejectedValue(refused('Down', status));
      const result = await resume('driver-1', status === 401 ? '' : 'token-1');
      expect(result.data).toMatchObject({ fromPhone: true });
    }
  });

  it('goes home with no signal and nothing saved', async () => {
    routing.getActiveTrip.mockRejectedValue(offline());
    expect((await resume()).data).toBeNull();
  });

  it('does not bring back a trip the driver ended with no signal', async () => {
    jest.mocked(loadSavedTrip).mockResolvedValue(saved());
    jest.mocked(listPendingTripEnds).mockResolvedValue([{ tripId: 'trip-1' }]);
    routing.getActiveTrip.mockRejectedValue(offline());
    expect((await resume()).data).toBeNull();
  });

  it('does not bring back another driver’s trip, or a trip left for more than a day', async () => {
    routing.getActiveTrip.mockRejectedValue(offline());
    jest.mocked(loadSavedTrip).mockResolvedValue(saved());
    expect((await resume('driver-2')).data).toBeNull();

    client.clear();
    jest
      .mocked(loadSavedTrip)
      .mockResolvedValue(saved(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()));
    expect((await resume('driver-1')).data).toBeNull();
  });

  it('shows a refusal the server will always give rather than guessing from the phone', async () => {
    jest.mocked(loadSavedTrip).mockResolvedValue(saved());
    routing.getActiveTrip.mockRejectedValue(refused('Forbidden', 403));
    const { result } = await renderHook(() => useResumeActiveTrip('token-1', 'driver-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 8000 });
  });

  it('asks nothing until there is an access token to ask with', async () => {
    const { result } = await renderHook(() => useResumeActiveTrip(undefined, 'driver-1'), {
      wrapper,
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(routing.getActiveTrip).not.toHaveBeenCalled();
  });
});
