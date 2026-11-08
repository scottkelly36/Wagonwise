import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import type { LengthUnit } from '../lib/units';

const KEY = 'wagonwise.lengthUnit';

export interface LengthUnitStore {
  /** How a driver types a vehicle's height, width and length: metres until they choose feet and inches. */
  readonly unit: LengthUnit;
  restore(): Promise<void>;
  setUnit(unit: LengthUnit): Promise<void>;
}

/** The driver's unit for a vehicle's size, kept on the phone only. What is sent to the server is always metres. */
export const useLengthUnitStore = create<LengthUnitStore>((set) => ({
  unit: 'metres',

  async restore() {
    try {
      const stored = await SecureStore.getItemAsync(KEY);
      if (stored === 'metres' || stored === 'feet') set({ unit: stored });
    } catch {
      // Unreadable: stay on metres, which is what a new driver gets.
    }
  },

  async setUnit(unit) {
    set({ unit });
    try {
      await SecureStore.setItemAsync(KEY, unit);
    } catch {
      // The choice still holds for this session; only remembering it failed.
    }
  },
}));
