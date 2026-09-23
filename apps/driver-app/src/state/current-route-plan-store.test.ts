import type { RoutePlanDto } from '@wagonwise/contracts/routing';

import { useCurrentRoutePlanStore } from './current-route-plan-store';

const plan = {
  id: 'plan-1',
  driverId: 'driver-1',
  profileId: 'profile-1',
  origin: { lat: 54.971, lon: -2.1 },
  destination: { lat: 54.973, lon: -2.017 },
  geometry: 'encoded',
  distanceKm: 8.0,
  durationMin: 12,
  avoidedRestrictions: [],
  hazardsOnRoute: [],
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as RoutePlanDto;

beforeEach(() => {
  useCurrentRoutePlanStore.setState({ plan: undefined });
});

describe('useCurrentRoutePlanStore', () => {
  it('starts with no plan', () => {
    expect(useCurrentRoutePlanStore.getState().plan).toBeUndefined();
  });

  it('setPlan makes it the current plan', () => {
    useCurrentRoutePlanStore.getState().setPlan(plan);
    expect(useCurrentRoutePlanStore.getState().plan).toEqual(plan);
  });

  it('clear removes it again', () => {
    useCurrentRoutePlanStore.getState().setPlan(plan);
    useCurrentRoutePlanStore.getState().clear();
    expect(useCurrentRoutePlanStore.getState().plan).toBeUndefined();
  });
});
