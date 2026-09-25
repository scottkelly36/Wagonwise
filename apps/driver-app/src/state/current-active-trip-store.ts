import type { ActiveTripDto } from '@wagonwise/contracts/routing';
import { create } from 'zustand';

interface CurrentActiveTripStore {
  readonly trip: ActiveTripDto | undefined;
  setTrip(trip: ActiveTripDto): void;
  clear(): void;
}

/**
 * Ephemeral, in-memory only — same shape as `current-route-plan-store.ts` (M5.5). A relaunch no
 * longer loses track of an in-progress trip, though: `index.tsx`'s gate calls
 * `GET /routing/trips/active` (design decision, 2026-09-24) and repopulates this store before
 * routing anywhere, rather than this store itself persisting. Holds exactly one trip, matching
 * the "one active trip per driver" rule `startTrip` already enforces server-side (decision, M5.6).
 */
export const useCurrentActiveTripStore = create<CurrentActiveTripStore>((set) => ({
  trip: undefined,
  setTrip: (trip) => set({ trip }),
  clear: () => set({ trip: undefined }),
}));
