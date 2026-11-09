import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'wagonwise.loaded';

export interface LoadStore {
  /** Whether the vehicle is loaded: Plan route then checks the hills on each route and offers an easier one. Empty until chosen. */
  readonly loaded: boolean;
  restore(): Promise<void>;
  setLoaded(loaded: boolean): Promise<void>;
}

/** The driver's Loaded / Empty choice, kept on the phone only: it decides how a route is looked for, not what is stored about them. */
export const useLoadStore = create<LoadStore>((set) => ({
  loaded: false,

  async restore() {
    try {
      const stored = await SecureStore.getItemAsync(KEY);
      if (stored === 'loaded') set({ loaded: true });
    } catch {
      // Unreadable: stay on Empty, which is what a new driver gets.
    }
  },

  async setLoaded(loaded) {
    set({ loaded });
    try {
      await SecureStore.setItemAsync(KEY, loaded ? 'loaded' : 'empty');
    } catch {
      // The choice still holds for this session; only remembering it failed.
    }
  },
}));
