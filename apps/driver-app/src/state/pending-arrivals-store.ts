import type { JobStatus } from '@wagonwise/contracts/jobs';
import { create } from 'zustand';

interface PendingArrivalsStore {
  /** The status each job has been moved to by an arrival the server has not heard yet, by job id. */
  readonly advances: Readonly<Record<string, JobStatus>>;
  /** What to say while something is saved and not yet sent (`waitingNotice`), or `undefined` when nothing is. */
  readonly waiting: string | undefined;
  setAdvances(advances: Readonly<Record<string, JobStatus>>): void;
  setPending(advances: Readonly<Record<string, JobStatus>>, waiting: string | undefined): void;
}

/** In-memory mirror of the arrivals waiting in `db/trip-outbox.ts`, so the job screen can show them (`withPendingArrival`). */
export const usePendingArrivalsStore = create<PendingArrivalsStore>((set) => ({
  advances: {},
  waiting: undefined,
  setAdvances: (advances) => set({ advances }),
  setPending: (advances, waiting) => set({ advances, waiting }),
}));
