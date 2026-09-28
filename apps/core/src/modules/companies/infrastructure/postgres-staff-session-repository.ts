import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { StaffSessionRepository } from '../application/ports/staff-session-repository.js';
import type { StaffId } from '../domain/staff-account.js';
import type { StaffSession, StaffSessionId } from '../domain/staff-session.js';
import type { UntypedDb } from './db.js';

interface SessionRow {
  readonly id: string;
  readonly staff_id: string;
  readonly refresh_token_hash: string;
  readonly previous_refresh_token_hash: string | null;
  readonly issued_at: Date;
  readonly last_used_at: Date;
  readonly refresh_expires_at: Date;
  readonly revoked_at: Date | null;
}

function toDomain(row: SessionRow): StaffSession {
  return {
    id: makeId<'StaffSessionId'>(row.id),
    staffId: makeId<'StaffId'>(row.staff_id),
    refreshTokenHash: row.refresh_token_hash,
    previousRefreshTokenHash: row.previous_refresh_token_hash,
    issuedAt: row.issued_at,
    lastUsedAt: row.last_used_at,
    refreshExpiresAt: row.refresh_expires_at,
    revokedAt: row.revoked_at,
  };
}

const COLUMNS = sql`id, staff_id, refresh_token_hash, previous_refresh_token_hash, issued_at,
  last_used_at, refresh_expires_at, revoked_at`;

/** Mirrors identity's PostgresSessionRepository, for staff (AGENTS.md rule 6: no sharing). */
export class PostgresStaffSessionRepository implements StaffSessionRepository {
  constructor(private readonly db: UntypedDb) {}

  async findByRefreshTokenHash(hash: string): Promise<StaffSession | null> {
    const { rows } = await sql<SessionRow>`
      select ${COLUMNS} from companies.staff_sessions
      where refresh_token_hash = ${hash} or previous_refresh_token_hash = ${hash}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findById(id: StaffSessionId): Promise<StaffSession | null> {
    const { rows } = await sql<SessionRow>`
      select ${COLUMNS} from companies.staff_sessions where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async save(session: StaffSession): Promise<void> {
    await sql`
      insert into companies.staff_sessions
        (id, staff_id, refresh_token_hash, previous_refresh_token_hash,
         issued_at, last_used_at, refresh_expires_at, revoked_at)
      values
        (${session.id}, ${session.staffId}, ${session.refreshTokenHash},
         ${session.previousRefreshTokenHash}, ${session.issuedAt}, ${session.lastUsedAt},
         ${session.refreshExpiresAt}, ${session.revokedAt})
      on conflict (id) do update set
        refresh_token_hash = excluded.refresh_token_hash,
        previous_refresh_token_hash = excluded.previous_refresh_token_hash,
        last_used_at = excluded.last_used_at,
        refresh_expires_at = excluded.refresh_expires_at,
        revoked_at = excluded.revoked_at
    `.execute(this.db);
  }

  async revokeAllForStaff(staffId: StaffId, now: Date): Promise<void> {
    await sql`
      update companies.staff_sessions set revoked_at = ${now}
      where staff_id = ${staffId} and revoked_at is null
    `.execute(this.db);
  }
}
