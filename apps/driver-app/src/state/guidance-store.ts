import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const MUTED_KEY = 'wagonwise.turnVoiceMuted';

export interface GuidanceStore {
  /** Spoken turns off. The turn card on screen stays: this only silences the voice. */
  readonly muted: boolean;
  restore(): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
}

// Same SecureStore-for-a-small-preference approach as `theme-store.ts`.
export const useGuidanceStore = create<GuidanceStore>((set) => ({
  muted: false,

  async restore() {
    const stored = await SecureStore.getItemAsync(MUTED_KEY);
    if (stored === 'true' || stored === 'false') set({ muted: stored === 'true' });
  },

  async setMuted(muted) {
    set({ muted });
    await SecureStore.setItemAsync(MUTED_KEY, String(muted));
  },
}));
