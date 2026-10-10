import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'wagonwise.fasterRouteSuggestions';

export interface FasterRouteStore {
  /** Whether to suggest quicker routes while driving. On unless the driver turns it off. */
  readonly enabled: boolean;
  /** Routes the driver kept their own over, per trip, so the same one is not offered again. Memory only: a new trip starts clean. */
  readonly keptByTrip: Readonly<Record<string, readonly string[]>>;
  restore(): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
  keep(tripId: string, key: string): void;
}

/** The driver's choice about faster-route suggestions, kept on the phone only. */
export const useFasterRouteStore = create<FasterRouteStore>((set) => ({
  enabled: true,
  keptByTrip: {},

  async restore() {
    try {
      const stored = await SecureStore.getItemAsync(KEY);
      if (stored === 'true' || stored === 'false') set({ enabled: stored === 'true' });
    } catch {
      // Unreadable: leave suggestions on, which is what a new driver gets.
    }
  },

  async setEnabled(enabled) {
    set({ enabled });
    await SecureStore.setItemAsync(KEY, String(enabled));
  },

  keep(tripId, key) {
    set((s) => ({
      keptByTrip: { ...s.keptByTrip, [tripId]: [...(s.keptByTrip[tripId] ?? []), key] },
    }));
  },
}));
