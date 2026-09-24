import type { RoutePlanDto } from '@wagonwise/contracts/routing';
import { create } from 'zustand';

interface CurrentRoutePlanStore {
  readonly plan: RoutePlanDto | undefined;
  setPlan(plan: RoutePlanDto): void;
  clear(): void;
}

/**
 * Ephemeral, in-memory only — no persistence (decision, M2.5: "no RoutePlan lifecycle in Phase
 * 1"). Holds exactly one "current" plan, matching the product's own shape: a driver plans one
 * route, then either starts it or plans another — there is no list of past plans to browse yet.
 * Exists so `/plan-route` and `/route-overview` can be separate screens (matching the design
 * doc's own screen table) without inventing a way to pass a large object through Expo Router's
 * string-only navigation params. `GET /routing/route-plans/:id` (M6.6) exists now, but only to
 * let the reroute prompt fetch a *new* plan by the id a push notification carries — this store
 * still isn't a cache keyed by id, just the one plan currently in play.
 */
export const useCurrentRoutePlanStore = create<CurrentRoutePlanStore>((set) => ({
  plan: undefined,
  setPlan: (plan) => set({ plan }),
  clear: () => set({ plan: undefined }),
}));
