import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { StaffAccountRepository } from '../application/ports/staff-account-repository.js';
import type { CompanyId } from '../domain/company.js';
import {
  isPrivilege,
  type Privilege,
  type SecondFactorMethod,
  type StaffAccount,
  type StaffId,
} from '../domain/staff-account.js';
import type { SecondFactor, StaffCredentials } from '../domain/staff-credentials.js';
import type { UntypedDb } from './db.js';

interface AccountRow {
  readonly id: string;
  readonly kind: 'platform' | 'fleet';
  readonly company_id: string | null;
  readonly email: string;
  readonly name: string;
  readonly privileges: unknown;
  readonly second_factor_method: SecondFactorMethod;
  readonly created_at: Date;
}

interface CredentialsRow {
  readonly id: string;
  readonly password_hash: string;
  readonly second_factor_method: SecondFactorMethod;
  readonly totp_secret_ciphertext: string | null;
  readonly phone: string | null;
}

/** The stored jsonb array, with anything not on today's list dropped rather than trusted. */
function privilegesFrom(value: unknown): Privilege[] {
  return Array.isArray(value)
    ? value.filter((v): v is Privilege => typeof v === 'string' && isPrivilege(v))
    : [];
}

function toDomain(row: AccountRow): StaffAccount {
  const base = {
    id: makeId<'StaffId'>(row.id),
    email: row.email,
    name: row.name,
    secondFactorMethod: row.second_factor_method,
    createdAt: row.created_at,
  };
  if (row.kind === 'platform') return { ...base, kind: 'platform' };
  if (row.company_id === null) throw new Error(`fleet user ${row.id} has no company`);
  return {
    ...base,
    kind: 'fleet',
    companyId: makeId<'CompanyId'>(row.company_id),
    privileges: privilegesFrom(row.privileges),
  };
}

function secondFactorFrom(row: CredentialsRow): SecondFactor {
  switch (row.second_factor_method) {
    case 'totp':
      if (row.totp_secret_ciphertext === null) throw new Error(`staff ${row.id}: no TOTP secret`);
      return { method: 'totp', secretCiphertext: row.totp_secret_ciphertext };
    case 'sms':
      if (row.phone === null) throw new Error(`staff ${row.id}: no phone`);
      return { method: 'sms', phone: row.phone };
    case 'email':
      return { method: 'email' };
  }
}

function secondFactorColumns(factor: SecondFactor) {
  return {
    method: factor.method,
    totp: factor.method === 'totp' ? factor.secretCiphertext : null,
    phone: factor.method === 'sms' ? factor.phone : null,
  };
}

const ACCOUNT_COLUMNS = sql`id, kind, company_id, email, name, privileges, second_factor_method, created_at`;

/** Raw `sql` tagged templates, same as every other repository here (decision 26). */
export class PostgresStaffAccountRepository implements StaffAccountRepository {
  constructor(private readonly db: UntypedDb) {}

  async create(account: StaffAccount, credentials: StaffCredentials): Promise<void> {
    const factor = secondFactorColumns(credentials.secondFactor);
    await sql`
      insert into companies.staff_accounts
        (id, kind, company_id, email, name, privileges, created_at,
         password_hash, second_factor_method, totp_secret_ciphertext, phone)
      values
        (${account.id}, ${account.kind}, ${account.kind === 'fleet' ? account.companyId : null},
         ${account.email}, ${account.name},
         ${JSON.stringify(account.kind === 'fleet' ? account.privileges : [])}::jsonb,
         ${account.createdAt}, ${credentials.passwordHash}, ${factor.method}, ${factor.totp},
         ${factor.phone})
    `.execute(this.db);
  }

  async save(account: StaffAccount): Promise<void> {
    await sql`
      update companies.staff_accounts set
        name = ${account.name},
        privileges = ${JSON.stringify(account.kind === 'fleet' ? account.privileges : [])}::jsonb
      where id = ${account.id}
    `.execute(this.db);
  }

  async saveCredentials(credentials: StaffCredentials): Promise<void> {
    const factor = secondFactorColumns(credentials.secondFactor);
    await sql`
      update companies.staff_accounts set
        password_hash = ${credentials.passwordHash},
        second_factor_method = ${factor.method},
        totp_secret_ciphertext = ${factor.totp},
        phone = ${factor.phone}
      where id = ${credentials.staffId}
    `.execute(this.db);
  }

  async findById(id: StaffId): Promise<StaffAccount | null> {
    const { rows } = await sql<AccountRow>`
      select ${ACCOUNT_COLUMNS} from companies.staff_accounts
      where id = ${id} and removed_at is null
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<StaffAccount | null> {
    const { rows } = await sql<AccountRow>`
      select ${ACCOUNT_COLUMNS} from companies.staff_accounts
      where lower(email) = lower(${email}) and removed_at is null
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findCredentials(id: StaffId): Promise<StaffCredentials | null> {
    const { rows } = await sql<CredentialsRow>`
      select id, password_hash, second_factor_method, totp_secret_ciphertext, phone
      from companies.staff_accounts
      where id = ${id} and removed_at is null
    `.execute(this.db);
    const row = rows[0];
    if (!row) return null;
    return {
      staffId: makeId<'StaffId'>(row.id),
      passwordHash: row.password_hash,
      secondFactor: secondFactorFrom(row),
    };
  }

  async listByCompany(companyId: CompanyId): Promise<StaffAccount[]> {
    const { rows } = await sql<AccountRow>`
      select ${ACCOUNT_COLUMNS} from companies.staff_accounts
      where company_id = ${companyId} and removed_at is null
      order by name, id
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async listAll(): Promise<StaffAccount[]> {
    const { rows } = await sql<AccountRow>`
      select ${ACCOUNT_COLUMNS} from companies.staff_accounts
      where removed_at is null
      order by (kind = 'platform') desc, name, id
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async countManagers(companyId: CompanyId): Promise<number> {
    const { rows } = await sql<{ count: string }>`
      select count(*) as count from companies.staff_accounts
      where company_id = ${companyId} and removed_at is null
        and privileges @> '["manage_users"]'::jsonb
    `.execute(this.db);
    return Number(rows[0]?.count ?? 0);
  }

  async remove(id: StaffId, at: Date): Promise<void> {
    await sql`
      update companies.staff_accounts set removed_at = ${at}
      where id = ${id} and removed_at is null
    `.execute(this.db);
  }
}
