import { sql, type Kysely } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { TesterRepository } from '../application/signups.js';
import type { FleetSize, Role, Tester, TesterId } from '../domain/signup.js';

export type UntypedDb = Kysely<Record<string, unknown>>;

interface Row {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: Role;
  readonly company: string | null;
  readonly fleet_size: FleetSize | null;
  readonly consented_at: Date;
  readonly created_at: Date;
}

const COLUMNS = 'id, email, name, role, company, fleet_size, consented_at, created_at';

const toTester = (r: Row): Tester => ({
  id: makeId<'TesterId'>(r.id),
  email: r.email,
  name: r.name ?? undefined,
  role: r.role,
  company: r.company ?? undefined,
  fleetSize: r.fleet_size ?? undefined,
  consentedAt: r.consented_at,
  createdAt: r.created_at,
});

/** Raw `sql` like every repository here (decision 26). Row-Level Security (migration 0058) lets only WagonWise staff in. */
export class PostgresTesterRepository implements TesterRepository {
  constructor(private readonly db: UntypedDb) {}

  async insertIfNew(t: Tester): Promise<boolean> {
    const result = await sql`
      insert into signups.testers (id, email, name, role, company, fleet_size, consented_at, created_at)
      values (${t.id}, ${t.email}, ${t.name ?? null}, ${t.role}, ${t.company ?? null}, ${t.fleetSize ?? null},
              ${t.consentedAt}, ${t.createdAt})
      on conflict (email) do nothing
    `.execute(this.db);
    return Number(result.numAffectedRows ?? 0) > 0;
  }

  async countSince(since: Date): Promise<number> {
    const { rows } = await sql<{ n: string }>`
      select count(*) as n from signups.testers where created_at >= ${since}
    `.execute(this.db);
    return Number(rows[0]?.n ?? 0);
  }

  async list(limit: number): Promise<Tester[]> {
    const { rows } = await sql<Row>`
      select ${sql.raw(COLUMNS)} from signups.testers order by created_at desc, id limit ${limit}
    `.execute(this.db);
    return rows.map(toTester);
  }

  async count(): Promise<number> {
    const { rows } = await sql<{ n: string }>`select count(*) as n from signups.testers`.execute(
      this.db,
    );
    return Number(rows[0]?.n ?? 0);
  }

  async delete(id: TesterId): Promise<boolean> {
    const result = await sql`delete from signups.testers where id = ${id}`.execute(this.db);
    return Number(result.numAffectedRows ?? 0) > 0;
  }

  async deleteByEmail(email: string): Promise<void> {
    await sql`delete from signups.testers where email = ${email}`.execute(this.db);
  }
}
