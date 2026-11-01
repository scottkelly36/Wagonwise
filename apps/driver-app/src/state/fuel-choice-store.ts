import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import type { FuelChoice } from '../lib/fuel-details';

const KEY = 'wagonwise.fuelChoice';

export interface FuelChoiceStore {
  /** Which fuel the map pins and the Nearby fuel list show. Diesel until the driver picks petrol. */
  readonly choice: FuelChoice;
  restore(): Promise<void>;
  setChoice(choice: FuelChoice): Promise<void>;
}

/** The driver's fuel, kept on the phone only so the list and the map always agree. */
export const useFuelChoiceStore = create<FuelChoiceStore>((set) => ({
  choice: 'diesel',

  async restore() {
    try {
      const stored = await SecureStore.getItemAsync(KEY);
      if (stored === 'diesel' || stored === 'petrol') set({ choice: stored });
    } catch {
      // Unreadable: stay on diesel, which is what a new driver gets.
    }
  },

  async setChoice(choice) {
    set({ choice });
    await SecureStore.setItemAsync(KEY, choice);
  },
}));
