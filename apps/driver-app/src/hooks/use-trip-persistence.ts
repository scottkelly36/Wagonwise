import { useEffect } from 'react';

import { clearSavedTrip, saveTrip } from '../db/saved-trip';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';

/**
 * Keeps the trip in progress on the phone (`db/saved-trip.ts`) so an app restart with no signal can put the driver back on their route.
 * Saves whenever there is a trip and its plan, and clears the moment the trip goes (ended, replaced). It reacts only to changes, never to
 * the stores starting empty, so opening the app does not wipe the trip before the launch gate has had a chance to bring it back.
 */
export function useTripPersistence(): void {
  useEffect(() => {
    const save = (): void => {
      const { trip } = useCurrentActiveTripStore.getState();
      const { plan } = useCurrentRoutePlanStore.getState();
      if (trip !== undefined && plan !== undefined)
        void saveTrip(trip, plan).catch(() => undefined);
    };
    const stopTrip = useCurrentActiveTripStore.subscribe((state, previous) => {
      if (previous.trip !== undefined && state.trip === undefined) {
        void clearSavedTrip().catch(() => undefined);
      } else {
        save();
      }
    });
    const stopPlan = useCurrentRoutePlanStore.subscribe(() => save());
    return () => {
      stopTrip();
      stopPlan();
    };
  }, []);
}
