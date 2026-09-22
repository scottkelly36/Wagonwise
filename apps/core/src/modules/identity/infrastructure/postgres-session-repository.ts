import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { SessionRepository } from '../application/ports/session-repository.js';
import type { Session, SessionId } from '../domain/session.js';
import type { UntypedDb } from './db.js';

interface SessionRow {
  readonly id: string;
  readonly driver_id: string;
  readonly refresh_token_hash: string;
  readonly previous_refresh_token_hash: string | null;
  readonly issued_at: Date;
  readonly last_used_at: Date;
  readonly refresh_expires_at: Date;
  readonly revoked_at: Date | null;
}

function toDomain(row: SessionRow): Session {
  return {
    id: makeId<'SessionId'>(row.id),
    driverId: makeId<'DriverId'>(row.driver_id),
    refreshTokenHash: row.refresh_token_hash,
    previousRefreshTokenHash: row.previous_refresh_token_hash,
    issuedAt: row.issued_at,
    lastUsedAt: row.last_used_at,
    refreshExpiresAt: row.refresh_expires_at,
    revokedAt: row.revoked_at,
  };
}

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly db: UntypedDb) {}

  async findByRefreshTokenHash(hash: string): Promise<Session | null> {
    const { rows } = await sql<SessionRow>`
      select id, driver_id, refresh_token_hash, previous_refresh_token_hash,
             issued_at, last_used_at, refresh_expires_at, revoked_at
      from identity.sessions
      where refresh_token_hash = ${hash} or previous_refresh_token_hash = ${hash}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findById(id: SessionId): Promise<Session | null> {
    const { rows } = await sql<SessionRow>`
      select id, driver_id, refresh_token_hash, previous_refresh_token_hash,
             issued_at, last_used_at, refresh_expires_at, revoked_at
      from identity.sessions where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  /** Upsert: created once at issuance, then updated repeatedly by rotate() and revoke(). */
  async save(session: Session): Promise<void> {
    await sql`
      insert into identity.sessions
        (id, driver_id, refresh_token_hash, previous_refresh_token_hash,
         issued_at, last_used_at, refresh_expires_at, revoked_at)
      values
        (${session.id}, ${session.driverId}, ${session.refreshTokenHash},
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
}
