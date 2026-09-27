import type { AdminDirectory } from '../ports/admin-directory.js';
import type { DriverId } from '../../domain/company.js';

/** A deterministic `AdminDirectory` test double — same role hazards' own copy of this stub
 *  plays. Defaults to "nobody's an admin", the safer default for a route test that isn't
 *  specifically exercising the admin gate. */
export class StubAdminDirectory implements AdminDirectory {
  constructor(private readonly adminDriverIds: ReadonlySet<DriverId> = new Set()) {}

  isAdmin(driverId: DriverId): Promise<boolean> {
    return Promise.resolve(this.adminDriverIds.has(driverId));
  }
}
