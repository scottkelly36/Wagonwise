import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'wagonwise.flowEventsOff';

export interface FlowEventsStore {
  /** On unless the driver has turned it off on the More tab (docs/flow-tracking-plan.md). `restoring` until the phone is read. */
  readonly status: 'restoring' | 'on' | 'off';
  restore(): Promise<void>;
  setOn(on: boolean): Promise<void>;
}

/** Whether this phone shares which screens are used. Kept on the phone only: the events themselves carry no driver. */
export const useFlowEventsStore = create<FlowEventsStore>((set) => ({
  status: 'restoring',

  async restore() {
    try {
      set({ status: (await SecureStore.getItemAsync(KEY)) === 'true' ? 'off' : 'on' });
    } catch {
      set({ status: 'on' });
    }
  },

  async setOn(on) {
    set({ status: on ? 'on' : 'off' });
    try {
      if (on) await SecureStore.deleteItemAsync(KEY);
      else await SecureStore.setItemAsync(KEY, 'true');
    } catch {
      // Not saved: the switch shows the choice for now, and the next launch may show it on again.
    }
  },
}));
