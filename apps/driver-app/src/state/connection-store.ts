import { create } from 'zustand';

interface ConnectionStore {
  /** True when the last request the app made never reached the server (no signal), false once one has. */
  readonly offline: boolean;
  setOffline(offline: boolean): void;
}

/**
 * Whether the phone can reach WagonWise, learned from the app's own requests (`api/http.ts`) rather than a separate network library: a
 * request that throws before any answer means no signal; any answer, even an error one, means there is. Starts online so nothing flashes at launch.
 */
export const useConnectionStore = create<ConnectionStore>((set) => ({
  offline: false,
  setOffline: (offline) => set((s) => (s.offline === offline ? s : { offline })),
}));
