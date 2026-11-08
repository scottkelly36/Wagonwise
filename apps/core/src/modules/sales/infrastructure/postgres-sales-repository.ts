import { sql, type Kysely } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { SalesRepository } from '../application/sales.js';
import type {
  ContactResult,
  How,
  LegalForm,
  Pitch,
  Prospect,
  ProspectId,
  Relationship,
  SalesEntry,
  SalesEntryId,
  Stage,
} from '../domain/sales.js';

export type UntypedDb = Kysely<Record<string, unknown>>;

interface ProspectRow {
  readonly id: string;
  readonly name: string;
  readonly town: string | null;
  readonly fleet_size: number | null;
  readonly haulage_type: string | null;
  readonly website: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly contact_person: string | null;
  readonly legal_form: LegalForm;
  readonly relationship: Relationship;
  readonly stage: Stage;
  readonly next_step: string | null;
  readonly next_step_on: string | null;
  readonly notes: string | null;
  readonly created_at: Date;
}

interface EntryRow {
  readonly id: string;
  readonly prospect_id: string;
  readonly at: Date;
  readonly how: How;
  readonly result: ContactResult;
  readonly pitch: Pitch | null;
  readonly note: string | null;
  readonly created_at: Date;
}

// The date goes out as text so it is the same day wherever the server runs (a `date` read as a JS Date is shifted by the zone).
const PROSPECT_COLUMNS = `id, name, town, fleet_size, haulage_type, website, phone, email, contact_person, legal_form,
  relationship, stage, next_step, to_char(next_step_on, 'YYYY-MM-DD') as next_step_on, notes, created_at`;

const toProspect = (r: ProspectRow): Prospect => ({
  id: makeId<'ProspectId'>(r.id),
  name: r.name,
  town: r.town ?? undefined,
  fleetSize: r.fleet_size ?? undefined,
  haulageType: r.haulage_type ?? undefined,
  website: r.website ?? undefined,
  phone: r.phone ?? undefined,
  email: r.email ?? undefined,
  contactPerson: r.contact_person ?? undefined,
  legalForm: r.legal_form,
  relationship: r.relationship,
  stage: r.stage,
  nextStep: r.next_step ?? undefined,
  nextStepOn: r.next_step_on ?? undefined,
  notes: r.notes ?? undefined,
  createdAt: r.created_at,
});

const toEntry = (r: EntryRow): SalesEntry => ({
  id: makeId<'SalesEntryId'>(r.id),
  prospectId: makeId<'ProspectId'>(r.prospect_id),
  at: r.at,
  how: r.how,
  result: r.result,
  pitch: r.pitch ?? undefined,
  note: r.note ?? undefined,
  createdAt: r.created_at,
});

/** Raw `sql` like every repository here (decision 26). Row-Level Security (migration 0084) lets only WagonWise staff in. */
export class PostgresSalesRepository implements SalesRepository {
  constructor(private readonly db: UntypedDb) {}

  async listProspects(): Promise<Prospect[]> {
    const { rows } = await sql<ProspectRow>`
      select ${sql.raw(PROSPECT_COLUMNS)} from sales.prospects order by lower(name), id
    `.execute(this.db);
    return rows.map(toProspect);
  }

  async listEntries(): Promise<SalesEntry[]> {
    const { rows } = await sql<EntryRow>`
      select id, prospect_id, at, how, result, pitch, note, created_at
      from sales.entries order by at desc, created_at desc, id
    `.execute(this.db);
    return rows.map(toEntry);
  }

  async findProspect(id: ProspectId): Promise<Prospect | null> {
    const { rows } = await sql<ProspectRow>`
      select ${sql.raw(PROSPECT_COLUMNS)} from sales.prospects where id = ${id}
    `.execute(this.db);
    const row = rows[0];
    return row === undefined ? null : toProspect(row);
  }

  async insertIfNew(p: Prospect): Promise<boolean> {
    const result = await sql`
      insert into sales.prospects (id, name, town, fleet_size, haulage_type, website, phone, email, contact_person,
                                   legal_form, relationship, stage, next_step, next_step_on, notes, created_at)
      values (${p.id}, ${p.name}, ${p.town ?? null}, ${p.fleetSize ?? null}, ${p.haulageType ?? null},
              ${p.website ?? null}, ${p.phone ?? null}, ${p.email ?? null}, ${p.contactPerson ?? null},
              ${p.legalForm}, ${p.relationship}, ${p.stage}, ${p.nextStep ?? null},
              ${p.nextStepOn ?? null}::date, ${p.notes ?? null}, ${p.createdAt})
      on conflict (lower(name)) do nothing
    `.execute(this.db);
    return Number(result.numAffectedRows ?? 0) > 0;
  }

  async nameTaken(name: string, exceptId?: ProspectId): Promise<boolean> {
    const { rows } = await sql<{ n: string }>`
      select count(*) as n from sales.prospects
      where lower(name) = lower(${name}) and id <> ${exceptId ?? '00000000-0000-0000-0000-000000000000'}
    `.execute(this.db);
    return Number(rows[0]?.n ?? 0) > 0;
  }

  async update(p: Prospect): Promise<boolean> {
    const result = await sql`
      update sales.prospects set
        name = ${p.name}, town = ${p.town ?? null}, fleet_size = ${p.fleetSize ?? null},
        haulage_type = ${p.haulageType ?? null}, website = ${p.website ?? null}, phone = ${p.phone ?? null},
        email = ${p.email ?? null}, contact_person = ${p.contactPerson ?? null}, legal_form = ${p.legalForm},
        relationship = ${p.relationship}, stage = ${p.stage}, next_step = ${p.nextStep ?? null},
        next_step_on = ${p.nextStepOn ?? null}::date, notes = ${p.notes ?? null}
      where id = ${p.id}
    `.execute(this.db);
    return Number(result.numAffectedRows ?? 0) > 0;
  }

  /** Two statements, one transaction: the data scope the request runs in is already one. */
  async recordEntry(entry: SalesEntry, prospect: Prospect): Promise<void> {
    await sql`
      insert into sales.entries (id, prospect_id, at, how, result, pitch, note, created_at)
      values (${entry.id}, ${entry.prospectId}, ${entry.at}, ${entry.how}, ${entry.result},
              ${entry.pitch ?? null}, ${entry.note ?? null}, ${entry.createdAt})
    `.execute(this.db);
    await this.update(prospect);
  }

  async deleteProspect(id: ProspectId): Promise<boolean> {
    const result = await sql`delete from sales.prospects where id = ${id}`.execute(this.db);
    return Number(result.numAffectedRows ?? 0) > 0;
  }

  async deleteEntry(id: SalesEntryId): Promise<boolean> {
    const result = await sql`delete from sales.entries where id = ${id}`.execute(this.db);
    return Number(result.numAffectedRows ?? 0) > 0;
  }
}
