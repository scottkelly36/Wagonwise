import { create } from 'zustand';

interface TripTollsStore {
  /** Ids of the route plans the driver chose for having no toll. */
  readonly avoiding: Readonly<Record<string, true>>;
  markAvoiding(planId: string): void;
  /** A plan made from another one keeps its choice: a re-plan or a switch to a quicker route does not quietly bring tolls back. */
  carryOver(fromPlanId: string, toPlanId: string): void;
  isAvoiding(planId: string | undefined): boolean;
}

/**
 * Remembers, in memory only, which routes the driver chose as toll free, so the re-plan from here and the faster-route check keep
 * avoiding tolls (a preference, not a ban: a toll is still used when there is no other way). Only the Toll free choice sets it; a
 * route that merely happens to have no toll was not chosen for that. The app being closed forgets it, like the plan itself.
 */
export const useTripTollsStore = create<TripTollsStore>((set, get) => ({
  avoiding: {},
  markAvoiding: (planId) => set((s) => ({ avoiding: { ...s.avoiding, [planId]: true } })),
  carryOver: (fromPlanId, toPlanId) => {
    if (get().avoiding[fromPlanId] === true) get().markAvoiding(toPlanId);
  },
  isAvoiding: (planId) => planId !== undefined && get().avoiding[planId] === true,
}));
