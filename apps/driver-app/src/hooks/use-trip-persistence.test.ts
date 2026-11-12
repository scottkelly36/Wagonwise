import { renderHook } from '@testing-library/react-native';
import type { ActiveTripDto, RoutePlanDto } from '@wagonwise/contracts/routing';

import { clearSavedTrip, saveTrip } from '../db/saved-trip';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { useTripPersistence } from './use-trip-persistence';

jest.mock('../db/saved-trip', () => ({
  saveTrip: jest.fn().mockResolvedValue(undefined),
  clearSavedTrip: jest.fn().mockResolvedValue(undefined),
}));

const trip = { id: 'trip-1', driverId: 'driver-1' } as ActiveTripDto;
const plan = { id: 'plan-1' } as RoutePlanDto;

beforeEach(() => {
  useCurrentActiveTripStore.setState({ trip: undefined });
  useCurrentRoutePlanStore.setState({ plan: undefined });
  jest.mocked(saveTrip).mockClear();
  jest.mocked(clearSavedTrip).mockClear();
});

describe('the trip kept on the phone', () => {
  it('does nothing when the app opens with no trip, so a saved one is not wiped before it can be brought back', async () => {
    await renderHook(() => useTripPersistence());
    expect(saveTrip).not.toHaveBeenCalled();
    expect(clearSavedTrip).not.toHaveBeenCalled();
  });

  it('saves once there is a trip and its plan, whichever arrives last', async () => {
    await renderHook(() => useTripPersistence());
    useCurrentActiveTripStore.getState().setTrip(trip);
    expect(saveTrip).not.toHaveBeenCalled();
    useCurrentRoutePlanStore.getState().setPlan(plan);
    expect(saveTrip).toHaveBeenCalledWith(trip, plan);
  });

  it('saves a plan made before the trip too', async () => {
    await renderHook(() => useTripPersistence());
    useCurrentRoutePlanStore.getState().setPlan(plan);
    expect(saveTrip).not.toHaveBeenCalled();
    useCurrentActiveTripStore.getState().setTrip(trip);
    expect(saveTrip).toHaveBeenCalledWith(trip, plan);
  });

  it('clears it the moment the trip goes', async () => {
    useCurrentRoutePlanStore.setState({ plan });
    useCurrentActiveTripStore.setState({ trip });
    await renderHook(() => useTripPersistence());
    useCurrentActiveTripStore.getState().clear();
    expect(clearSavedTrip).toHaveBeenCalledTimes(1);
  });

  it('does not clear it for a plan being made with no trip yet', async () => {
    await renderHook(() => useTripPersistence());
    useCurrentRoutePlanStore.getState().setPlan(plan);
    useCurrentRoutePlanStore.getState().clear();
    expect(clearSavedTrip).not.toHaveBeenCalled();
  });

  it('stops listening when it unmounts', async () => {
    const { unmount } = await renderHook(() => useTripPersistence());
    await unmount();
    useCurrentActiveTripStore.getState().setTrip(trip);
    useCurrentRoutePlanStore.getState().setPlan(plan);
    expect(saveTrip).not.toHaveBeenCalled();
  });
});
