import { sql, type Kysely } from 'kysely';
import type { ReferralCodeRepository, ReferralRepository } from '../application/referrals.js';
import type { Referral, ReferralStatus } from '../domain/referral.js';

export type UntypedDb = Kysely<Record<string, unknown>>;

interface Row {
  readonly id: string;
  readonly code: string;
  readonly driver_id: string;
  readonly firm_name: string;
  readonly status: ReferralStatus;
  readonly reward_email: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

const toReferral = (r: Row): Referral => ({
  id: r.id,
  code: r.code,
  driverId: r.driver_id,
  firmName: r.firm_name,
  status: r.status,
  rewardEmail: r.reward_email,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const isUniqueViolation = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';

/** Raw `sql` like every repository here (decision 26). Migration 0097. */
export class PostgresReferralCodes implements ReferralCodeRepository {
  constructor(private readonly db: UntypedDb) {}

  async findByDriver(driverId: string): Promise<string | null> {
    const { rows } = await sql<{ code: string }>`
      select code from referrals.codes where driver_id = ${driverId}`.execute(this.db);
    return rows[0]?.code ?? null;
  }

  async findDriver(code: string): Promise<string | null> {
    const { rows } = await sql<{ driver_id: string }>`
      select driver_id from referrals.codes where code = ${code}`.execute(this.db);
    return rows[0]?.driver_id ?? null;
  }

  async insert(driverId: string, code: string, at: Date): Promise<boolean> {
    try {
      await sql`insert into referrals.codes (driver_id, code, created_at) values (${driverId}, ${code}, ${at})`.execute(
        this.db,
      );
      return true;
    } catch (e) {
      if (isUniqueViolation(e)) return false;
      throw e;
    }
  }

  async eraseDriver(driverId: string): Promise<void> {
    await sql`delete from referrals.codes where driver_id = ${driverId}`.execute(this.db);
  }
}

export class PostgresReferrals implements ReferralRepository {
  constructor(private readonly db: UntypedDb) {}

  async insert(r: Referral, firmKey: string): Promise<boolean> {
    try {
      await sql`
        insert into referrals.referrals (id, code, driver_id, firm_name, firm_key, status, reward_email, created_at, updated_at)
        values (${r.id}, ${r.code}, ${r.driverId}, ${r.firmName}, ${firmKey}, ${r.status}, ${r.rewardEmail}, ${r.createdAt}, ${r.updatedAt})
      `.execute(this.db);
      return true;
    } catch (e) {
      if (isUniqueViolation(e)) return false;
      throw e;
    }
  }

  async find(id: string): Promise<Referral | null> {
    const { rows } = await sql<Row>`select * from referrals.referrals where id = ${id}`.execute(
      this.db,
    );
    return rows[0] === undefined ? null : toReferral(rows[0]);
  }

  async listForDriver(driverId: string): Promise<Referral[]> {
    const { rows } = await sql<Row>`
      select * from referrals.referrals where driver_id = ${driverId} order by created_at desc`.execute(
      this.db,
    );
    return rows.map(toReferral);
  }

  async listAll(): Promise<Referral[]> {
    const { rows } = await sql<Row>`
      select * from referrals.referrals order by created_at desc limit 500`.execute(this.db);
    return rows.map(toReferral);
  }

  async update(r: Referral): Promise<void> {
    await sql`
      update referrals.referrals
      set status = ${r.status}, reward_email = ${r.rewardEmail}, updated_at = ${r.updatedAt}
      where id = ${r.id}`.execute(this.db);
  }

  async eraseDriver(driverId: string): Promise<void> {
    await sql`delete from referrals.referrals where driver_id = ${driverId}`.execute(this.db);
  }
}
