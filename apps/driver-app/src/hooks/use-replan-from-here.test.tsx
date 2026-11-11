import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import * as routingApi from '../api/routing';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { useLoadStore } from '../state/load-store';
import { useTripTollsStore } from '../state/trip-tolls-store';
import { useReplanFromHere } from './use-replan-from-here';

jest.mock('../api/routing');
jest.mock('./use-access-token', () => ({ useAccessToken: () => 'token-1' }));

const api = jest.mocked(routingApi);

const plan = {
  id: 'plan-1',
  profileId: 'profile-1',
  destination: { lat: 56, lon: -3.7 },
} as NonNullable<ReturnType<typeof useCurrentRoutePlanStore.getState>['plan']>;
const here = { lat: 55, lon: -2 };

let client = new QueryClient();
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  jest.resetAllMocks();
  api.planRoute.mockResolvedValue({ ...plan, id: 'plan-2' as typeof plan.id });
  api.startTrip.mockResolvedValue({ id: 'trip-2' } as Awaited<ReturnType<typeof api.startTrip>>);
  useCurrentRoutePlanStore.setState({ plan });
  useCurrentActiveTripStore.setState({ trip: undefined });
  useLoadStore.setState({ loaded: false });
  useTripTollsStore.setState({ avoiding: {} });
});

async function replan() {
  const { result } = await renderHook(() => useReplanFromHere(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync({ here, headingDeg: 90 });
  });
}

it('plans the same way as before when the vehicle is empty', async () => {
  await replan();
  const request = api.planRoute.mock.calls[0]?.[1];
  expect(request).toMatchObject({ profileId: 'profile-1', origin: here, originHeadingDeg: 90 });
  expect(request).not.toHaveProperty('strategy');
});

it('asks for the gentle route when the vehicle is loaded, so a re-plan does not climb the hill again', async () => {
  useLoadStore.setState({ loaded: true });
  await replan();
  expect(api.planRoute.mock.calls[0]?.[1]).toMatchObject({ strategy: 'gentle' });
});

it('keeps avoiding tolls when the route was chosen for having none, and passes the choice to the new route', async () => {
  useTripTollsStore.getState().markAvoiding('plan-1');
  await replan();
  expect(api.planRoute.mock.calls[0]?.[1]).toMatchObject({ avoidTolls: true });
  expect(useTripTollsStore.getState().isAvoiding('plan-2')).toBe(true);
});

it('does not mention tolls when the route was not chosen for having none', async () => {
  await replan();
  expect(api.planRoute.mock.calls[0]?.[1]).not.toHaveProperty('avoidTolls');
  expect(useTripTollsStore.getState().isAvoiding('plan-2')).toBe(false);
});
