import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'wagonwise.walkthroughSeen';

export interface WalkthroughStore {
  /** `restoring` until the phone has been asked, so the launch gate waits instead of showing the tour to someone who has seen it. */
  readonly status: 'restoring' | 'unseen' | 'seen';
  restore(): Promise<void>;
  /** The driver finished or skipped the tour: it is not shown again by itself (More still opens it). */
  markSeen(): Promise<void>;
}

/** Whether the first-run tour has been shown on this phone. Kept on the phone only. */
export const useWalkthroughStore = create<WalkthroughStore>((set) => ({
  status: 'restoring',

  async restore() {
    try {
      const stored = await SecureStore.getItemAsync(KEY);
      set({ status: stored === 'true' ? 'seen' : 'unseen' });
    } catch {
      // Unreadable: do not nag with the tour on every launch.
      set({ status: 'seen' });
    }
  },

  async markSeen() {
    set({ status: 'seen' });
    try {
      await SecureStore.setItemAsync(KEY, 'true');
    } catch {
      // Not saved: the tour may show once more, which is harmless.
    }
  },
}));
