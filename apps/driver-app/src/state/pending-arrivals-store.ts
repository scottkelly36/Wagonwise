import type { JobStatus } from '@wagonwise/contracts/jobs';
import { create } from 'zustand';

interface PendingArrivalsStore {
  /** The status each job has been moved to by an arrival the server has not heard yet, by job id. */
  readonly advances: Readonly<Record<string, JobStatus>>;
  setAdvances(advances: Readonly<Record<string, JobStatus>>): void;
}

/** In-memory mirror of the arrivals waiting in `db/trip-outbox.ts`, so the job screen can show them (`withPendingArrival`). */
export const usePendingArrivalsStore = create<PendingArrivalsStore>((set) => ({
  advances: {},
  setAdvances: (advances) => set({ advances }),
}));
