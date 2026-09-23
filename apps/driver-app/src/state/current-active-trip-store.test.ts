import type { ActiveTripDto } from '@wagonwise/contracts/routing';

import { useCurrentActiveTripStore } from './current-active-trip-store';

const trip = {
  id: 'trip-1',
  routePlanId: 'plan-1',
  driverId: 'driver-1',
  startedAt: '2026-06-15T08:00:00.000Z',
} as unknown as ActiveTripDto;

beforeEach(() => {
  useCurrentActiveTripStore.setState({ trip: undefined });
});

describe('useCurrentActiveTripStore', () => {
  it('starts with no trip', () => {
    expect(useCurrentActiveTripStore.getState().trip).toBeUndefined();
  });

  it('setTrip makes it the current trip', () => {
    useCurrentActiveTripStore.getState().setTrip(trip);
    expect(useCurrentActiveTripStore.getState().trip).toEqual(trip);
  });

  it('clear removes it again', () => {
    useCurrentActiveTripStore.getState().setTrip(trip);
    useCurrentActiveTripStore.getState().clear();
    expect(useCurrentActiveTripStore.getState().trip).toBeUndefined();
  });
});
