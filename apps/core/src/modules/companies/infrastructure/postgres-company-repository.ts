import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { CompanyRepository } from '../application/ports/company-repository.js';
import type { Company, CompanyId } from '../domain/company.js';
import type { UntypedDb } from './db.js';

interface CompanyRow {
  readonly id: string;
  readonly name: string;
  readonly created_at: Date;
  readonly photo_retention_months: number;
}

function toDomain(row: CompanyRow): Company {
  return {
    id: makeId<'CompanyId'>(row.id),
    name: row.name,
    createdAt: row.created_at,
    photoRetentionMonths: row.photo_retention_months,
  };
}

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as every
 *  other repository in this codebase (decision 26, docs/progress.md). */
export class PostgresCompanyRepository implements CompanyRepository {
  constructor(private readonly db: UntypedDb) {}

  async save(company: Company): Promise<void> {
    await sql`
      insert into companies.companies (id, name, created_at, photo_retention_months)
      values (${company.id}, ${company.name}, ${company.createdAt}, ${company.photoRetentionMonths})
      on conflict (id) do update set
        name = excluded.name,
        photo_retention_months = excluded.photo_retention_months
    `.execute(this.db);
  }

  async findAll(): Promise<Company[]> {
    const { rows } = await sql<CompanyRow>`
      select id, name, created_at, photo_retention_months
      from companies.companies order by created_at desc
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async findById(id: CompanyId): Promise<Company | null> {
    const { rows } = await sql<CompanyRow>`
      select id, name, created_at, photo_retention_months from companies.companies where id = ${id}
    `.execute(this.db);
    const row = rows[0];
    return row === undefined ? null : toDomain(row);
  }

  async setPhotoRetention(id: CompanyId, months: number): Promise<void> {
    await sql`
      update companies.companies set photo_retention_months = ${months} where id = ${id}
    `.execute(this.db);
  }
}
