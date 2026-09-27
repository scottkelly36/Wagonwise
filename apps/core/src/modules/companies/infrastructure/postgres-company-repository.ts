import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { CompanyRepository } from '../application/ports/company-repository.js';
import type { Company } from '../domain/company.js';
import type { UntypedDb } from './db.js';

interface CompanyRow {
  readonly id: string;
  readonly name: string;
  readonly created_at: Date;
}

function toDomain(row: CompanyRow): Company {
  return {
    id: makeId<'CompanyId'>(row.id),
    name: row.name,
    createdAt: row.created_at,
  };
}

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as every
 *  other repository in this codebase (decision 26, docs/progress.md). */
export class PostgresCompanyRepository implements CompanyRepository {
  constructor(private readonly db: UntypedDb) {}

  async save(company: Company): Promise<void> {
    await sql`
      insert into companies.companies (id, name, created_at)
      values (${company.id}, ${company.name}, ${company.createdAt})
      on conflict (id) do update set name = excluded.name
    `.execute(this.db);
  }

  async findAll(): Promise<Company[]> {
    const { rows } = await sql<CompanyRow>`
      select id, name, created_at from companies.companies order by created_at desc
    `.execute(this.db);
    return rows.map(toDomain);
  }
}
