import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { parseStartPreference, type StartPreference } from '../lib/auto-start-hours';

const KEY = 'wagonwise.hours-start';

export interface HoursStartStore {
  readonly preference: StartPreference;
  /** True once the saved choice has been read, so nothing is asked or started on a guess. */
  readonly restored: boolean;
  restore(): Promise<void>;
  setPreference(preference: StartPreference): Promise<void>;
}

/** The driver's choice for "when I start a route", kept on the phone only. */
export const useHoursStartStore = create<HoursStartStore>((set) => ({
  preference: 'ask',
  restored: false,

  async restore() {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      set({ preference: parseStartPreference(raw), restored: true });
    } catch {
      // Unreadable: ask, which is what a new driver gets.
      set({ preference: 'ask', restored: true });
    }
  },

  async setPreference(preference) {
    set({ preference });
    await SecureStore.setItemAsync(KEY, preference);
  },
}));
