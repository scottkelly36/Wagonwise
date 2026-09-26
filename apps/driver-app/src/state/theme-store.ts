import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

const THEME_MODE_KEY = 'wagonwise.themeMode';

export interface ThemeStore {
  readonly mode: ThemeMode;
  /** Called once at app boot (`app/_layout.tsx`), same "restore on launch" shape as
   *  `auth-store.ts`'s own `restore()`. */
  restore(): Promise<void>;
  setMode(mode: ThemeMode): Promise<void>;
}

// SecureStore rather than a new dependency — it's already how this app persists a small piece
// of local state (`auth-store.ts`'s cached `DriverInfo`, no more secret than a theme choice),
// and one more string key doesn't earn adding a plain-preferences library from scratch.
export const useThemeStore = create<ThemeStore>((set) => ({
  // Dark until a driver actually changes it — this is the only look the app has ever had, so
  // shipping this feature must not change anyone's screen the moment it lands.
  mode: 'dark',

  async restore() {
    const stored = await SecureStore.getItemAsync(THEME_MODE_KEY);
    if (stored === 'light' || stored === 'dark') {
      set({ mode: stored });
    }
  },

  async setMode(mode) {
    await SecureStore.setItemAsync(THEME_MODE_KEY, mode);
    set({ mode });
  },
}));
