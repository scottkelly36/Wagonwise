import { create } from 'zustand';

interface PausedCompanyStore {
  /** The firm whose paused account is hiding the driver's job, or `undefined` when no firm is. Set from each answer for the current job. */
  readonly name: string | undefined;
  set(name: string | undefined): void;
}

export const usePausedCompanyStore = create<PausedCompanyStore>((set) => ({
  name: undefined,
  set: (name) => set({ name }),
}));
