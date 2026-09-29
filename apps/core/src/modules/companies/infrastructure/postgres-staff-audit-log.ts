import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { StaffAuditLog } from '../application/ports/staff-audit-log.js';
import type { CompanyId } from '../domain/company.js';
import type { StaffId } from '../domain/staff-account.js';
import {
  STAFF_AUDIT_ACTIONS,
  type StaffAuditAction,
  type StaffAuditDetails,
  type StaffAuditEntry,
} from '../domain/staff-audit.js';
import type { UntypedDb } from './db.js';

interface AuditRow {
  readonly id: string;
  readonly at: Date;
  readonly action: string;
  readonly actor_id: string | null;
  readonly company_id: string | null;
  readonly target_id: string | null;
  readonly details: unknown;
}

function isAction(value: string): value is StaffAuditAction {
  return (STAFF_AUDIT_ACTIONS as readonly string[]).includes(value);
}

/** Only string and string-list values, the shapes the use cases write. */
function detailsFrom(value: unknown): StaffAuditDetails {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const details: Record<string, string | readonly string[]> = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === 'string') details[key] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) details[key] = v;
  }
  return details;
}

function toDomain(row: AuditRow): StaffAuditEntry {
  if (!isAction(row.action)) throw new Error(`audit entry ${row.id}: unknown action ${row.action}`);
  return {
    id: makeId<'StaffAuditEntryId'>(row.id),
    at: row.at,
    action: row.action,
    actorId: row.actor_id === null ? undefined : makeId<'StaffId'>(row.actor_id),
    companyId: row.company_id === null ? undefined : makeId<'CompanyId'>(row.company_id),
    targetId: row.target_id === null ? undefined : makeId<'StaffId'>(row.target_id),
    details: detailsFrom(row.details),
  };
}

/** Raw `sql` tagged templates, same as every other repository here (decision 26). */
export class PostgresStaffAuditLog implements StaffAuditLog {
  constructor(private readonly db: UntypedDb) {}

  async record(entry: StaffAuditEntry): Promise<void> {
    await sql`
      insert into companies.staff_audit (id, at, action, actor_id, company_id, target_id, details)
      values (${entry.id}, ${entry.at}, ${entry.action}, ${entry.actorId ?? null},
              ${entry.companyId ?? null}, ${entry.targetId ?? null},
              ${JSON.stringify(entry.details)}::jsonb)
    `.execute(this.db);
  }

  async recent(input: {
    readonly companyId?: CompanyId | undefined;
    readonly limit: number;
  }): Promise<StaffAuditEntry[]> {
    const { rows } = await sql<AuditRow>`
      select id, at, action, actor_id, company_id, target_id, details
      from companies.staff_audit
      where ${input.companyId === undefined ? sql`true` : sql`company_id = ${input.companyId}`}
      order by at desc, id
      limit ${input.limit}
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async countSince(input: {
    readonly targetId: StaffId;
    readonly action: StaffAuditAction;
    readonly since: Date;
  }): Promise<number> {
    const { rows } = await sql<{ n: number }>`
      select count(*)::int as n from companies.staff_audit
      where target_id = ${input.targetId} and action = ${input.action} and at >= ${input.since}
    `.execute(this.db);
    return rows[0]?.n ?? 0;
  }
}
