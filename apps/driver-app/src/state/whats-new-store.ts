import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'wagonwise.whats-new-seen';

export interface WhatsNewStore {
  /** The note this driver last said "Got it" to; it is not shown again, and the next one is. */
  readonly seenId: string | undefined;
  /** False until the phone has said what was seen, so a note already seen is not flashed first. */
  readonly restored: boolean;
  restore(): Promise<void>;
  markSeen(id: string): Promise<void>;
}

export const useWhatsNewStore = create<WhatsNewStore>((set) => ({
  seenId: undefined,
  restored: false,

  async restore() {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      set({ seenId: raw ?? undefined, restored: true });
    } catch {
      // Unreadable: the note may show once more, which is harmless.
      set({ restored: true });
    }
  },

  async markSeen(id) {
    set({ seenId: id });
    try {
      await SecureStore.setItemAsync(KEY, id);
    } catch {
      // Not saved: it may show again next time, which is harmless.
    }
  },
}));
