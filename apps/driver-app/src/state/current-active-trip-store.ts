import type { ActiveTripDto } from '@wagonwise/contracts/routing';
import { create } from 'zustand';

interface CurrentActiveTripStore {
  readonly trip: ActiveTripDto | undefined;
  setTrip(trip: ActiveTripDto): void;
  clear(): void;
}

/**
 * Ephemeral, in-memory only — same shape as `current-route-plan-store.ts` (M5.5) and the same
 * reason: core has no `GET /routing/trips/:id` to re-fetch from (M5.6 deliberately doesn't add
 * one, docs/progress.md — the alternative, a driver relaunching mid-trip, is a known and
 * explicitly accepted gap). Holds exactly one trip, matching the "one active trip per driver"
 * rule `startTrip` already enforces server-side (decision, M5.6).
 */
export const useCurrentActiveTripStore = create<CurrentActiveTripStore>((set) => ({
  trip: undefined,
  setTrip: (trip) => set({ trip }),
  clear: () => set({ trip: undefined }),
}));
