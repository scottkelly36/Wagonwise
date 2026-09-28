import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { StaffChallengeRepository } from '../application/ports/staff-challenge-repository.js';
import type { SecondFactorMethod } from '../domain/staff-account.js';
import type { StaffChallenge, StaffChallengeId } from '../domain/staff-challenge.js';
import type { UntypedDb } from './db.js';

interface ChallengeRow {
  readonly id: string;
  readonly purpose: 'sign-in' | 'enrolment';
  readonly staff_id: string | null;
  readonly invite_id: string | null;
  readonly method: SecondFactorMethod;
  readonly code_hash: string | null;
  readonly pending_password_hash: string | null;
  readonly pending_totp_secret_ciphertext: string | null;
  readonly pending_phone: string | null;
  readonly attempts: number;
  readonly created_at: Date;
  readonly expires_at: Date;
  readonly consumed_at: Date | null;
}

function toDomain(row: ChallengeRow): StaffChallenge {
  const base = {
    id: makeId<'StaffChallengeId'>(row.id),
    method: row.method,
    codeHash: row.code_hash,
    attempts: row.attempts,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };
  if (row.purpose === 'sign-in') {
    if (row.staff_id === null) throw new Error(`sign-in challenge ${row.id} has no staff_id`);
    return { ...base, purpose: 'sign-in', staffId: makeId<'StaffId'>(row.staff_id) };
  }
  if (row.invite_id === null || row.pending_password_hash === null) {
    throw new Error(`enrolment challenge ${row.id} is incomplete`);
  }
  return {
    ...base,
    purpose: 'enrolment',
    inviteId: makeId<'StaffInviteId'>(row.invite_id),
    pendingPasswordHash: row.pending_password_hash,
    pendingTotpSecretCiphertext: row.pending_totp_secret_ciphertext,
    pendingPhone: row.pending_phone,
  };
}

export class PostgresStaffChallengeRepository implements StaffChallengeRepository {
  constructor(private readonly db: UntypedDb) {}

  async save(c: StaffChallenge): Promise<void> {
    const enrolment = c.purpose === 'enrolment' ? c : undefined;
    await sql`
      insert into companies.staff_challenges
        (id, purpose, staff_id, invite_id, method, code_hash, pending_password_hash,
         pending_totp_secret_ciphertext, pending_phone, attempts, created_at, expires_at,
         consumed_at)
      values
        (${c.id}, ${c.purpose}, ${c.purpose === 'sign-in' ? c.staffId : null},
         ${enrolment?.inviteId ?? null}, ${c.method}, ${c.codeHash},
         ${enrolment?.pendingPasswordHash ?? null},
         ${enrolment?.pendingTotpSecretCiphertext ?? null}, ${enrolment?.pendingPhone ?? null},
         ${c.attempts}, ${c.createdAt}, ${c.expiresAt}, ${c.consumedAt})
      on conflict (id) do update set
        attempts = excluded.attempts,
        consumed_at = excluded.consumed_at
    `.execute(this.db);
  }

  async findById(id: StaffChallengeId): Promise<StaffChallenge | null> {
    const { rows } = await sql<ChallengeRow>`
      select id, purpose, staff_id, invite_id, method, code_hash, pending_password_hash,
             pending_totp_secret_ciphertext, pending_phone, attempts, created_at, expires_at,
             consumed_at
      from companies.staff_challenges where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }
}
