import type { HoursSharingRowDto } from '@wagonwise/contracts/hours';
import { create } from 'zustand';

import * as hoursApi from '../api/hours';
import { WORDING_VERSION } from '../lib/hours-share';
import { useAuthStore } from './auth-store';

function accessToken(): string | undefined {
  const state = useAuthStore.getState().state;
  return state.status === 'signedIn' ? state.accessToken : undefined;
}

export interface HoursSharingStore {
  /** Each company the driver drives for, with the firm's switch and the driver's own choice. Empty until loaded. */
  readonly companies: HoursSharingRowDto[];
  /** Loads it again. A failure leaves what was there: sharing is never switched on by an error. */
  refresh(): Promise<void>;
  /** The driver's choice for one company. Throws if the server refuses (for example the firm switched it off). */
  setSharing(companyId: string, sharing: boolean): Promise<void>;
  /** Forgets everything on this phone (sign-out). */
  reset(): void;
}

/** What the driver has agreed to, as the server last said. It is the server that decides whether anything is sent. */
export const useHoursSharingStore = create<HoursSharingStore>((set, get) => ({
  companies: [],

  async refresh() {
    const token = accessToken();
    if (token === undefined) return;
    try {
      set({ companies: await hoursApi.getHoursSharing(token) });
    } catch {
      // Best effort, like the other background refreshes: the next one tries again.
    }
  },

  async setSharing(companyId, sharing) {
    const token = accessToken();
    if (token === undefined) return;
    await hoursApi.setHoursSharing(token, companyId, sharing, WORDING_VERSION);
    await get().refresh();
  },

  reset() {
    set({ companies: [] });
  },
}));

/** The companies the driver is sharing with now: they chose to, and the firm still allows it. */
export const sharingWith = (companies: readonly HoursSharingRowDto[]): HoursSharingRowDto[] =>
  companies.filter((c) => c.sharing && c.firmEnabled);
