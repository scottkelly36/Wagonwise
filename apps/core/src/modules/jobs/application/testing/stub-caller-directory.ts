import type { StaffId } from '../../domain/job.js';
import type { Caller, CallerDirectory } from '../ports/caller-directory.js';

/** A fixed table of staffId -> Caller, for route tests that need to control exactly what the
 *  permission check sees without a real `companies` module. */
export class StubCallerDirectory implements CallerDirectory {
  constructor(private readonly callers: ReadonlyMap<StaffId, Caller>) {}

  getCaller(staffId: StaffId): Promise<Caller | null> {
    return Promise.resolve(this.callers.get(staffId) ?? null);
  }
}
