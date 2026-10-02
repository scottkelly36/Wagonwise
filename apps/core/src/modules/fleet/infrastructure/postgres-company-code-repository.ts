import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { CompanyCodeRepository } from '../application/ports/company-code-repository.js';
import type { CompanyId } from '../domain/vehicle.js';
import type { UntypedDb } from './db.js';

export class PostgresCompanyCodeRepository implements CompanyCodeRepository {
  constructor(private readonly db: UntypedDb) {}

  async findByCompany(companyId: CompanyId): Promise<string | null> {
    const { rows } = await sql<{ code: string }>`
      select code from fleet.company_codes where company_id = ${companyId}
    `.execute(this.db);
    return rows[0]?.code ?? null;
  }

  /** Through `fleet.company_for_code()` (migration 0028): a driver can resolve an exact code
   *  without being able to read anyone's codes. */
  async findCompanyByCode(code: string): Promise<CompanyId | null> {
    const { rows } = await sql<{ company_id: string | null }>`
      select fleet.company_for_code(${code}) as company_id
    `.execute(this.db);
    const id = rows[0]?.company_id;
    return id === null || id === undefined ? null : makeId<'CompanyId'>(id);
  }

  async save(companyId: CompanyId, code: string, at: Date): Promise<void> {
    await sql`
      insert into fleet.company_codes (company_id, code, created_at)
      values (${companyId}, ${code}, ${at})
      on conflict (company_id) do update set code = excluded.code, created_at = excluded.created_at
    `.execute(this.db);
  }
}
