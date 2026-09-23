import type { RoutePlanDto } from '@wagonwise/contracts/routing';
import { create } from 'zustand';

interface CurrentRoutePlanStore {
  readonly plan: RoutePlanDto | undefined;
  setPlan(plan: RoutePlanDto): void;
  clear(): void;
}

/**
 * Ephemeral, in-memory only — no persistence, no `GET /routing/route-plans/:id` to re-fetch
 * from (decision, M2.5: "no RoutePlan lifecycle in Phase 1"; confirmed by checking core's
 * routes.ts, which has no such endpoint). Holds exactly one "current" plan, matching the
 * product's own shape: a driver plans one route, then either starts it or plans another — there
 * is no list of past plans to browse yet. Exists so `/plan-route` and `/route-overview` can be
 * separate screens (matching the design doc's own screen table) without inventing a way to pass
 * a large object through Expo Router's string-only navigation params.
 */
export const useCurrentRoutePlanStore = create<CurrentRoutePlanStore>((set) => ({
  plan: undefined,
  setPlan: (plan) => set({ plan }),
  clear: () => set({ plan: undefined }),
}));
