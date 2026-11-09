import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import type { DistanceUnit, FuelUnit } from '../lib/units';

const DISTANCE_KEY = 'wagonwise.distanceUnit';
const FUEL_KEY = 'wagonwise.fuelUnit';

export interface MeasureUnitsStore {
  /** How the length of a route is shown: kilometres until the driver chooses miles. */
  readonly distance: DistanceUnit;
  /** How fuel economy is shown and typed: litres per 100 km until the driver chooses miles per gallon. */
  readonly fuel: FuelUnit;
  restore(): Promise<void>;
  setDistance(unit: DistanceUnit): Promise<void>;
  setFuel(unit: FuelUnit): Promise<void>;
}

async function remember(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // The choice still holds for this session; only remembering it failed.
  }
}

/** The driver's units for route length and fuel economy, kept on the phone only. What is sent to the server is always kilometres and
 *  litres per 100 km. */
export const useMeasureUnitsStore = create<MeasureUnitsStore>((set) => ({
  distance: 'km',
  fuel: 'l100km',

  async restore() {
    try {
      const distance = await SecureStore.getItemAsync(DISTANCE_KEY);
      if (distance === 'km' || distance === 'miles') set({ distance });
      const fuel = await SecureStore.getItemAsync(FUEL_KEY);
      if (fuel === 'l100km' || fuel === 'mpg') set({ fuel });
    } catch {
      // Unreadable: stay on kilometres and L/100km, which is what a new driver gets.
    }
  },

  async setDistance(distance) {
    set({ distance });
    await remember(DISTANCE_KEY, distance);
  },

  async setFuel(fuel) {
    set({ fuel });
    await remember(FUEL_KEY, fuel);
  },
}));
