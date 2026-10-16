import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'wagonwise.stillThereQuestions';

export interface StillThereStore {
  /** Whether to ask "was it still there?" by voice after passing a hazard. On unless the driver turns it off. */
  readonly enabled: boolean;
  restore(): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
}

/** The driver's choice about the spoken "still there?" questions, kept on the phone only. */
export const useStillThereStore = create<StillThereStore>((set) => ({
  enabled: true,

  async restore() {
    try {
      const stored = await SecureStore.getItemAsync(KEY);
      if (stored === 'true' || stored === 'false') set({ enabled: stored === 'true' });
    } catch {
      // Unreadable: leave the questions on, which is what a new driver gets.
    }
  },

  async setEnabled(enabled) {
    set({ enabled });
    await SecureStore.setItemAsync(KEY, String(enabled));
  },
}));
