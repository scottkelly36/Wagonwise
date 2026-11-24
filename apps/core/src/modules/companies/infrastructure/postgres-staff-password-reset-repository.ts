import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { StaffPasswordResetRepository } from '../application/ports/staff-password-reset-repository.js';
import type { StaffId } from '../domain/staff-account.js';
import type { StaffPasswordReset } from '../domain/staff-password-reset.js';
import type { UntypedDb } from './db.js';

interface Row {
  readonly id: string;
  readonly staff_id: string;
  readonly token_hash: string;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly used_at: Date | null;
}

export class PostgresStaffPasswordResetRepository implements StaffPasswordResetRepository {
  constructor(private readonly db: UntypedDb) {}

  async save(reset: StaffPasswordReset): Promise<void> {
    await sql`
      insert into companies.staff_password_resets (id, staff_id, token_hash, created_at, expires_at, used_at)
      values (${reset.id}, ${reset.staffId}, ${reset.tokenHash}, ${reset.createdAt}, ${reset.expiresAt}, ${reset.usedAt})
    `.execute(this.db);
  }

  async findByTokenHash(tokenHash: string): Promise<StaffPasswordReset | null> {
    const { rows } = await sql<Row>`
      select id, staff_id, token_hash, created_at, expires_at, used_at
      from companies.staff_password_resets where token_hash = ${tokenHash}
    `.execute(this.db);
    const row = rows[0];
    return row === undefined
      ? null
      : {
          id: makeId<'StaffPasswordResetId'>(row.id),
          staffId: makeId<'StaffId'>(row.staff_id),
          tokenHash: row.token_hash,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
          usedAt: row.used_at,
        };
  }

  async markUsed(id: StaffPasswordReset['id'], at: Date): Promise<boolean> {
    const result = await sql`
      update companies.staff_password_resets set used_at = ${at} where id = ${id} and used_at is null
    `.execute(this.db);
    return Number(result.numAffectedRows ?? 0) > 0;
  }

  async countSince(staffId: StaffId, since: Date): Promise<number> {
    const { rows } = await sql<{ n: string }>`
      select count(*) as n from companies.staff_password_resets where staff_id = ${staffId} and created_at >= ${since}
    `.execute(this.db);
    return Number(rows[0]?.n ?? 0);
  }
}
