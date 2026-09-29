import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { StaffInviteRepository } from '../application/ports/staff-invite-repository.js';
import type { CompanyId } from '../domain/company.js';
import { isPrivilege, type Privilege } from '../domain/staff-account.js';
import type { StaffInvite, StaffInviteId } from '../domain/staff-invite.js';
import type { UntypedDb } from './db.js';

interface InviteRow {
  readonly id: string;
  readonly kind: 'platform' | 'fleet';
  readonly company_id: string | null;
  readonly email: string;
  readonly name: string;
  readonly privileges: unknown;
  readonly token_hash: string;
  readonly invited_by: string | null;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly accepted_at: Date | null;
}

function toDomain(row: InviteRow): StaffInvite {
  const privileges: Privilege[] = Array.isArray(row.privileges)
    ? row.privileges.filter((v): v is Privilege => typeof v === 'string' && isPrivilege(v))
    : [];
  return {
    id: makeId<'StaffInviteId'>(row.id),
    kind: row.kind,
    companyId: row.company_id === null ? undefined : makeId<'CompanyId'>(row.company_id),
    email: row.email,
    name: row.name,
    privileges,
    tokenHash: row.token_hash,
    invitedBy: row.invited_by === null ? null : makeId<'StaffId'>(row.invited_by),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
  };
}

const COLUMNS = sql`id, kind, company_id, email, name, privileges, token_hash, invited_by,
  created_at, expires_at, accepted_at`;

export class PostgresStaffInviteRepository implements StaffInviteRepository {
  constructor(private readonly db: UntypedDb) {}

  async save(invite: StaffInvite): Promise<void> {
    await sql`
      insert into companies.staff_invites
        (id, kind, company_id, email, name, privileges, token_hash, invited_by,
         created_at, expires_at, accepted_at)
      values
        (${invite.id}, ${invite.kind}, ${invite.companyId ?? null}, ${invite.email},
         ${invite.name}, ${JSON.stringify(invite.privileges)}::jsonb, ${invite.tokenHash},
         ${invite.invitedBy}, ${invite.createdAt}, ${invite.expiresAt}, ${invite.acceptedAt})
      on conflict (id) do update set accepted_at = excluded.accepted_at
    `.execute(this.db);
  }

  async findById(id: StaffInviteId): Promise<StaffInvite | null> {
    const { rows } = await sql<InviteRow>`
      select ${COLUMNS} from companies.staff_invites where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<StaffInvite | null> {
    const { rows } = await sql<InviteRow>`
      select ${COLUMNS} from companies.staff_invites where token_hash = ${tokenHash}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async listByCompany(companyId: CompanyId): Promise<StaffInvite[]> {
    const { rows } = await sql<InviteRow>`
      select ${COLUMNS} from companies.staff_invites
      where company_id = ${companyId}
      order by created_at desc
    `.execute(this.db);
    return rows.map(toDomain);
  }
}
