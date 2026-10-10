import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const KEY = 'wagonwise.dismissed-build';

export interface UpdateNoticeStore {
  /** The build version the driver last said "not now" to; they are not told again until a newer one is out. */
  readonly dismissedVersion: string | undefined;
  restore(): Promise<void>;
  dismiss(version: string | undefined): Promise<void>;
}

export const useUpdateNoticeStore = create<UpdateNoticeStore>((set) => ({
  dismissedVersion: undefined,

  async restore() {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      set({ dismissedVersion: raw ?? undefined });
    } catch {
      // Unreadable: the notice may show once more, which is harmless.
    }
  },

  async dismiss(version) {
    set({ dismissedVersion: version });
    if (version !== undefined) await SecureStore.setItemAsync(KEY, version);
  },
}));
