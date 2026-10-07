import { sql } from 'kysely';
import type { UntypedDb } from './db.js';

/**
 * Takes a deleted driver out of fleet's records (account deletion). Must run in the platform data
 * scope: `driver_links` is row-level secured, and no single company owns the rows involved.
 *
 * - Invitations a company made to the driver's email or phone that were never accepted are deleted:
 *   they hold nothing but that identifier.
 * - The driver's own links stay as history (the company's record of who worked for it) but lose the
 *   identifier, and any live link ends, so the driver can no longer be assigned work.
 */
export class PostgresDriverLinkEraser {
  constructor(private readonly db: UntypedDb) {}

  async erase(driverId: string, identifier: string, at: Date): Promise<void> {
    await sql`
      delete from fleet.driver_links where driver_id is null and invited_identifier = ${identifier}
    `.execute(this.db);
    await sql`
      update fleet.driver_links
      set invited_identifier = null,
          status = case when status in ('invited', 'requested', 'active') then 'left' else status end,
          decided_at = case
            when status in ('invited', 'requested', 'active') then ${at}
            else decided_at
          end
      where driver_id = ${driverId}
    `.execute(this.db);
  }
}
