import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'wagonwise.usualVehicle';

export interface UsualVehicleStore {
  /** The saved vehicle the driver set as their usual: Where to? then starts with it chosen. Undefined until set. */
  readonly profileId: string | undefined;
  restore(): Promise<void>;
  setUsual(profileId: string | undefined): Promise<void>;
}

/** The driver's usual lorry, kept on the phone only: just the id of one of their own saved vehicles, which stay on the server as before. */
export const useUsualVehicleStore = create<UsualVehicleStore>((set) => ({
  profileId: undefined,

  async restore() {
    try {
      const stored = await SecureStore.getItemAsync(KEY);
      if (stored !== null && stored !== '') set({ profileId: stored });
    } catch {
      // Unreadable: no usual lorry, so the driver is asked again, which is what a new driver gets.
    }
  },

  async setUsual(profileId) {
    set({ profileId });
    try {
      if (profileId === undefined) await SecureStore.deleteItemAsync(KEY);
      else await SecureStore.setItemAsync(KEY, profileId);
    } catch {
      // Still holds for this session; only remembering it failed.
    }
  },
}));
