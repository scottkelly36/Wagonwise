import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { Transaction } from '../../../shared/ports/unit-of-work.js';
import type { InviteCodeRepository } from '../application/ports/invite-code-repository.js';
import type { InviteCode } from '../domain/invite-code.js';
import type { UntypedDb } from './db.js';

interface InviteCodeRow {
  readonly code: string;
  readonly redeemed_by: string | null;
  readonly redeemed_at: Date | null;
  readonly created_at: Date;
}

function toDomain(row: InviteCodeRow): InviteCode {
  return {
    code: row.code,
    redeemedBy: row.redeemed_by === null ? null : makeId<'DriverId'>(row.redeemed_by),
    redeemedAt: row.redeemed_at,
    createdAt: row.created_at,
  };
}

export class PostgresInviteCodeRepository implements InviteCodeRepository {
  constructor(private readonly db: UntypedDb) {}

  async findByCode(code: string): Promise<InviteCode | null> {
    const { rows } = await sql<InviteCodeRow>`
      select code, redeemed_by, redeemed_at, created_at
      from identity.invite_codes where code = ${code}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  /** Upsert: an invite code is seeded once (manually, for now — see the migration) and later
   *  redeemed, which is an update to the same row, not a new one. */
  async save(invite: InviteCode, tx?: Transaction): Promise<void> {
    const executor = tx ? (tx as unknown as UntypedDb) : this.db;
    await sql`
      insert into identity.invite_codes (code, redeemed_by, redeemed_at, created_at)
      values (${invite.code}, ${invite.redeemedBy}, ${invite.redeemedAt}, ${invite.createdAt})
      on conflict (code) do update set
        redeemed_by = excluded.redeemed_by,
        redeemed_at = excluded.redeemed_at
    `.execute(executor);
  }
}
