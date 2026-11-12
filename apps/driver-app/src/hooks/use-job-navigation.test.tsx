import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import * as jobsApi from '../api/jobs';
import * as routingApi from '../api/routing';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { useJobNavigation } from './use-job-navigation';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../api/jobs');
jest.mock('../api/routing');
jest.mock('./use-access-token', () => ({ useAccessToken: () => 'token-1' }));

const jobs = jest.mocked(jobsApi);
const routing = jest.mocked(routingApi);

type Job = Parameters<ReturnType<typeof useJobNavigation>['mutateAsync']>[0]['job'];
const job = (
  status: string,
  stops: unknown[] = [{ kind: 'delivery', location: { lat: 56, lon: -3 } }],
) => ({ id: 'job-1', status, currentStop: 0, stops }) as unknown as Job;

let client = new QueryClient();
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  for (const m of [mockPush, jobs.advanceJobStatus, routing.endTrip, routing.planRoute]) {
    (m as jest.Mock).mockReset();
  }
  useCurrentActiveTripStore.setState({ trip: undefined });
  useCurrentRoutePlanStore.setState({ plan: undefined });
});

async function start(input: Parameters<ReturnType<typeof useJobNavigation>['mutateAsync']>[0]) {
  const { result } = await renderHook(() => useJobNavigation(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync(input);
  });
}

describe('Start and Set off on a job', () => {
  it('opens the route choice, and does not plan a route itself', async () => {
    await start({ job: job('loaded') });
    expect(mockPush).toHaveBeenCalledWith('/job-route');
    expect(routing.planRoute).not.toHaveBeenCalled();
  });

  it('moves the job to En route first for Set off, then opens the route choice', async () => {
    jobs.advanceJobStatus.mockResolvedValue(job('en_route'));
    await start({ job: job('loaded'), advanceFirst: 'en_route' });
    expect(jobs.advanceJobStatus).toHaveBeenCalledWith('token-1', 'job-1', { status: 'en_route' });
    expect(mockPush).toHaveBeenCalledWith('/job-route');
  });

  it('ends a trip left running for an earlier leg before opening the choice', async () => {
    routing.endTrip.mockResolvedValue({} as Awaited<ReturnType<typeof routingApi.endTrip>>);
    useCurrentActiveTripStore.setState({
      trip: { id: 'trip-old' } as Awaited<ReturnType<typeof routingApi.startTrip>>,
    });
    await start({ job: job('loaded') });
    expect(routing.endTrip).toHaveBeenCalledWith('token-1', 'trip-old');
    expect(useCurrentActiveTripStore.getState().trip).toBeUndefined();
    expect(mockPush).toHaveBeenCalledWith('/job-route');
  });

  it('opens nothing when there is no stop to go to', async () => {
    await start({ job: job('at_delivery') });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
