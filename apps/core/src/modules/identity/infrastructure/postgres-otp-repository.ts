import { sql } from 'kysely';
import type { OtpRepository } from '../application/ports/otp-repository.js';
import type { Otp } from '../domain/otp.js';
import type { UntypedDb } from './db.js';

interface OtpRow {
  readonly id: string;
  readonly code_hash: string;
  readonly expires_at: Date;
  readonly consumed_at: Date | null;
  readonly attempts: number;
}

function toDomain(row: OtpRow): Otp {
  return {
    id: row.id,
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    attempts: row.attempts,
  };
}

export class PostgresOtpRepository implements OtpRepository {
  constructor(private readonly db: UntypedDb) {}

  async findLatestFor(identifier: string): Promise<Otp | null> {
    const { rows } = await sql<OtpRow>`
      select id, code_hash, expires_at, consumed_at, attempts
      from identity.otp_codes
      where identifier = ${identifier}
      order by created_at desc
      limit 1
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  /** Upsert: a fresh request inserts a new row (requestOtp assigns a new id); verifyOtp re-saves
   *  the same row with attempts/consumedAt updated. `identifier` is write-once, set on insert
   *  and left alone on conflict — the port's `save(identifier, otp)` shape always supplies it,
   *  but only the very first save is the one that matters. */
  async save(identifier: string, otp: Otp): Promise<void> {
    await sql`
      insert into identity.otp_codes (id, identifier, code_hash, expires_at, consumed_at, attempts)
      values (${otp.id}, ${identifier}, ${otp.codeHash}, ${otp.expiresAt}, ${otp.consumedAt}, ${otp.attempts})
      on conflict (id) do update set
        code_hash = excluded.code_hash,
        expires_at = excluded.expires_at,
        consumed_at = excluded.consumed_at,
        attempts = excluded.attempts
    `.execute(this.db);
  }
}
