import { sql } from 'kysely';
import type { StaffRecoveryCodeRepository } from '../application/ports/staff-recovery-code-repository.js';
import type { StaffId } from '../domain/staff-account.js';
import type { UntypedDb } from './db.js';

export class PostgresStaffRecoveryCodeRepository implements StaffRecoveryCodeRepository {
  constructor(private readonly db: UntypedDb) {}

  async replaceAll(staffId: StaffId, codeHashes: readonly string[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await sql`delete from companies.staff_recovery_codes where staff_id = ${staffId}`.execute(
        trx,
      );
      for (const hash of codeHashes) {
        await sql`
          insert into companies.staff_recovery_codes (staff_id, code_hash) values (${staffId}, ${hash})
        `.execute(trx);
      }
    });
  }

  /** One statement, so two simultaneous uses of the same code can't both succeed. */
  async use(staffId: StaffId, codeHash: string, at: Date): Promise<boolean> {
    const result = await sql`
      update companies.staff_recovery_codes set used_at = ${at}
      where staff_id = ${staffId} and code_hash = ${codeHash} and used_at is null
    `.execute(this.db);
    return Number(result.numAffectedRows ?? 0) === 1;
  }

  async countUnused(staffId: StaffId): Promise<number> {
    const { rows } = await sql<{ count: string }>`
      select count(*) as count from companies.staff_recovery_codes
      where staff_id = ${staffId} and used_at is null
    `.execute(this.db);
    return Number(rows[0]?.count ?? 0);
  }
}
