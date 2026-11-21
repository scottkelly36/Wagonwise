import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'wagonwise.showGpsSpeed';

export interface GpsSpeedStore {
  /** Whether the trip screen shows the phone's GPS speed beside the speed limit. On unless the driver turns it off. */
  readonly enabled: boolean;
  restore(): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
}

/** The driver's choice about the speed box on the trip screen, kept on the phone only. */
export const useGpsSpeedStore = create<GpsSpeedStore>((set) => ({
  enabled: true,

  async restore() {
    try {
      const stored = await SecureStore.getItemAsync(KEY);
      if (stored === 'true' || stored === 'false') set({ enabled: stored === 'true' });
    } catch {
      // Unreadable: leave the box on, which is what a new driver gets.
    }
  },

  async setEnabled(enabled) {
    set({ enabled });
    try {
      await SecureStore.setItemAsync(KEY, String(enabled));
    } catch {
      // The choice still holds for this session; only remembering it failed.
    }
  },
}));
