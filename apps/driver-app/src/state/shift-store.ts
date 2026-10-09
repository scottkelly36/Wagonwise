import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import type { Activity, ActivityKind, RuleSet } from '../lib/driver-hours';
import { switchActivity } from '../lib/shift-log';

const SHIFT_KEY = 'wagonwise.shift';

interface Saved {
  readonly log: Activity[];
  readonly rules: RuleSet;
  readonly extensionsLeft: number;
}

export interface ShiftStore extends Saved {
  /** `manual` today: the driver taps. A tachograph source will plug in here later. */
  readonly source: 'manual';
  restore(): Promise<void>;
  /** Moves on to `kind` now, or ends the shift with `finish`. */
  record(kind: ActivityKind | 'finish', now?: number): Promise<void>;
  setRules(rules: RuleSet): Promise<void>;
  setExtensionsLeft(count: number): Promise<void>;
  /** Forgets everything on this phone. */
  clear(): Promise<void>;
}

// Kept on the phone only (the same SecureStore the app already uses for small local state). Nothing is sent to a server.
const DEFAULTS: Saved = { log: [], rules: 'assimilated_eu', extensionsLeft: 0 };

const persist = (saved: Saved): Promise<void> =>
  SecureStore.setItemAsync(SHIFT_KEY, JSON.stringify(saved));

export const useShiftStore = create<ShiftStore>((set, get) => {
  const save = async (change: Partial<Saved>): Promise<void> => {
    const { log, rules, extensionsLeft } = get();
    const next = { log, rules, extensionsLeft, ...change };
    set(next);
    await persist(next);
  };
  return {
    ...DEFAULTS,
    source: 'manual',

    async restore() {
      const raw = await SecureStore.getItemAsync(SHIFT_KEY);
      if (raw === null) return;
      try {
        const parsed = JSON.parse(raw) as Partial<Saved>;
        set({
          log: Array.isArray(parsed.log) ? parsed.log : [],
          rules: parsed.rules === 'gb_domestic' ? 'gb_domestic' : 'assimilated_eu',
          extensionsLeft: Number.isInteger(parsed.extensionsLeft)
            ? Math.min(2, Math.max(0, parsed.extensionsLeft as number))
            : 0,
        });
      } catch {
        // A damaged record is ignored rather than crashing the app; the driver starts again.
      }
    },

    record: (kind, now = Date.now()) => save({ log: switchActivity(get().log, kind, now) }),
    setRules: (rules) => save({ rules }),
    setExtensionsLeft: (count) => save({ extensionsLeft: Math.min(2, Math.max(0, count)) }),
    clear: () => save(DEFAULTS),
  };
});
