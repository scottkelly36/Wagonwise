import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import * as routingApi from '../api/routing';
import { CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, OFFER_VISIBLE_MS } from '../lib/faster-route';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { useFasterRouteStore } from '../state/faster-route-store';
import { useFasterRoute, type FasterRouteOffer } from './use-faster-route';

jest.mock('../api/routing');
jest.mock('./use-access-token', () => ({ useAccessToken: () => 'token-1' }));

const api = jest.mocked(routingApi);

const offer = {
  routePlanId: '33333333-3333-3333-3333-333333333333' as FasterRouteOffer['routePlanId'],
  key: 'abc12345',
  savingMinutes: 8,
  currentMinutes: 60,
  alternativeMinutes: 52,
};
const here = { lat: 55, lon: -2 };

// One client for the whole test: a new one per render would throw away the mutation's state.
let client = new QueryClient();
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  jest.useFakeTimers();
  // React Native's jest setup leaves this as a mock function; on a phone it is the string.
  Object.defineProperty(AppState, 'currentState', {
    value: 'active',
    configurable: true,
    writable: true,
  });
  jest.resetAllMocks();
  useFasterRouteStore.setState({ enabled: true, keptByTrip: {} });
  useCurrentActiveTripStore.setState({ trip: undefined });
  useCurrentRoutePlanStore.setState({ plan: undefined });
});

afterEach(() => {
  jest.useRealTimers();
});

it('asks after the first delay, with the position, and shows the offer', async () => {
  api.checkFasterRoute.mockResolvedValue(offer);
  const { result } = await renderHook(() => useFasterRoute('trip-1', here, 90), { wrapper });

  expect(api.checkFasterRoute).not.toHaveBeenCalled();
  await advance(FIRST_CHECK_DELAY_MS);

  expect(api.checkFasterRoute).toHaveBeenCalledWith('token-1', 'trip-1', {
    position: here,
    headingDeg: 90,
    keptKeys: [],
  });
  expect(result.current.offer).toEqual(offer);
});

it('shows nothing when there is nothing to offer, and asks again later', async () => {
  api.checkFasterRoute.mockResolvedValue(null);
  const { result } = await renderHook(() => useFasterRoute('trip-1', here, undefined), { wrapper });
  await advance(FIRST_CHECK_DELAY_MS);
  expect(result.current.offer).toBeUndefined();
  await advance(CHECK_INTERVAL_MS);
  expect(api.checkFasterRoute).toHaveBeenCalledTimes(2);
  expect(api.checkFasterRoute.mock.calls[0]?.[2]).not.toHaveProperty('headingDeg');
});

it('lets an unanswered offer lapse after about a minute without remembering it as kept', async () => {
  api.checkFasterRoute.mockResolvedValue(offer);
  const { result } = await renderHook(() => useFasterRoute('trip-1', here, undefined), { wrapper });
  await advance(FIRST_CHECK_DELAY_MS);
  expect(result.current.offer).toBeDefined();
  await advance(OFFER_VISIBLE_MS);
  expect(result.current.offer).toBeUndefined();
  expect(useFasterRouteStore.getState().keptByTrip).toEqual({});
});

it('remembers a kept route for the trip and sends it with the next check', async () => {
  api.checkFasterRoute.mockResolvedValue(offer);
  const { result } = await renderHook(() => useFasterRoute('trip-1', here, undefined), { wrapper });
  await advance(FIRST_CHECK_DELAY_MS);
  await act(async () => {
    result.current.keep();
  });
  expect(result.current.offer).toBeUndefined();
  expect(useFasterRouteStore.getState().keptByTrip['trip-1']).toEqual(['abc12345']);

  api.checkFasterRoute.mockResolvedValue(null);
  await advance(CHECK_INTERVAL_MS);
  expect(api.checkFasterRoute.mock.calls[1]?.[2]).toMatchObject({ keptKeys: ['abc12345'] });
});

it('does not ask when suggestions are off', async () => {
  useFasterRouteStore.setState({ enabled: false });
  await renderHook(() => useFasterRoute('trip-1', here, undefined), { wrapper });
  await advance(FIRST_CHECK_DELAY_MS + CHECK_INTERVAL_MS);
  expect(api.checkFasterRoute).not.toHaveBeenCalled();
});

it('does not ask without a trip', async () => {
  await renderHook(() => useFasterRoute(undefined, here, undefined), { wrapper });
  await advance(FIRST_CHECK_DELAY_MS + CHECK_INTERVAL_MS);
  expect(api.checkFasterRoute).not.toHaveBeenCalled();
});

it('does not ask before there is a position', async () => {
  await renderHook(() => useFasterRoute('trip-1', undefined, undefined), { wrapper });
  await advance(FIRST_CHECK_DELAY_MS + CHECK_INTERVAL_MS);
  expect(api.checkFasterRoute).not.toHaveBeenCalled();
});

it('stays quiet when a check fails', async () => {
  api.checkFasterRoute.mockRejectedValue(new Error('offline'));
  const { result } = await renderHook(() => useFasterRoute('trip-1', here, undefined), { wrapper });
  await advance(FIRST_CHECK_DELAY_MS);
  expect(result.current.offer).toBeUndefined();
});

it('switches by making the new route first, then ending the old trip and starting a new one', async () => {
  const newPlan = { id: offer.routePlanId } as Awaited<ReturnType<typeof routingApi.getRoutePlan>>;
  const newTrip = { id: 'trip-2' } as Awaited<ReturnType<typeof routingApi.startTrip>>;
  api.checkFasterRoute.mockResolvedValue(offer);
  api.getRoutePlan.mockResolvedValue(newPlan);
  api.endTrip.mockResolvedValue({} as Awaited<ReturnType<typeof routingApi.endTrip>>);
  api.startTrip.mockResolvedValue(newTrip);
  useCurrentActiveTripStore.setState({
    trip: { id: 'trip-1' } as Awaited<ReturnType<typeof routingApi.startTrip>>,
  });

  const { result } = await renderHook(() => useFasterRoute('trip-1', here, undefined), { wrapper });
  await advance(FIRST_CHECK_DELAY_MS);
  await act(async () => {
    result.current.switchNow();
  });

  expect(api.getRoutePlan).toHaveBeenCalledWith('token-1', offer.routePlanId);
  expect(api.endTrip).toHaveBeenCalledWith('token-1', 'trip-1');
  expect(api.startTrip).toHaveBeenCalledWith('token-1', offer.routePlanId);
  expect(useCurrentRoutePlanStore.getState().plan).toBe(newPlan);
  expect(useCurrentActiveTripStore.getState().trip).toBe(newTrip);
  expect(result.current.offer).toBeUndefined();
});

it('leaves the driver on their route when the new one cannot be started', async () => {
  api.checkFasterRoute.mockResolvedValue(offer);
  api.getRoutePlan.mockRejectedValue(new Error('offline'));
  const current = { id: 'trip-1' } as Awaited<ReturnType<typeof routingApi.startTrip>>;
  useCurrentActiveTripStore.setState({ trip: current });

  const { result } = await renderHook(() => useFasterRoute('trip-1', here, undefined), { wrapper });
  await advance(FIRST_CHECK_DELAY_MS);
  await act(async () => {
    result.current.switchNow();
  });

  // TanStack Query tells React about the failure on a timer, which the fake clock holds back.
  await advance(1);
  expect(api.endTrip).not.toHaveBeenCalled();
  expect(useCurrentActiveTripStore.getState().trip).toBe(current);
  expect(result.current.switchFailed).toBe(true);
});
