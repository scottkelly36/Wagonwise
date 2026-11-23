import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { AccountStateRepository } from '../application/ports/account-state-repository.js';
import {
  ACCOUNT_STATUSES,
  ACCOUNT_AUTOMATION_MODES,
  DEFAULT_ACCOUNT_SETTINGS,
  type AccountSettings,
  type AccountState,
  type AccountStateMove,
  type AccountStatus,
} from '../domain/account-state.js';
import type { CompanyId } from '../domain/company.js';
import type { UntypedDb } from './db.js';

interface StateRow {
  readonly id: string;
  readonly account_status: string;
  readonly trial_ends_on: string | null;
  readonly overdue_since: Date | null;
  readonly paused_at: Date | null;
  readonly status_note: string;
  readonly status_hold: boolean;
}

function asStatus(value: string): AccountStatus {
  const found = ACCOUNT_STATUSES.find((s) => s === value);
  // The column has a check constraint, so this cannot happen; failing closed is better than guessing.
  if (found === undefined) throw new Error(`unknown account status: ${value}`);
  return found;
}

function toState(row: StateRow): AccountState {
  return {
    companyId: makeId<'CompanyId'>(row.id),
    status: asStatus(row.account_status),
    trialEndsOn: row.trial_ends_on,
    overdueSince: row.overdue_since,
    pausedAt: row.paused_at,
    note: row.status_note,
    hold: row.status_hold,
  };
}

// `trial_ends_on` is read as text so a day is the same day wherever the server runs.
const COLUMNS = sql`id, account_status, to_char(trial_ends_on, 'YYYY-MM-DD') as trial_ends_on,
  overdue_since, paused_at, status_note, status_hold`;

/** Raw `sql` queries, as every other repository here (decision 26). `companies.companies` has no row-level policy, so
 *  these work in any scope; the log table is WagonWise staff only. */
export class PostgresAccountStateRepository implements AccountStateRepository {
  constructor(private readonly db: UntypedDb) {}

  async get(companyId: CompanyId): Promise<AccountState | null> {
    const { rows } = await sql<StateRow>`
      select ${COLUMNS} from companies.companies where id = ${companyId}
    `.execute(this.db);
    const row = rows[0];
    return row === undefined ? null : toState(row);
  }

  async getStatus(companyId: CompanyId): Promise<AccountStatus | null> {
    const { rows } = await sql<{ account_status: string }>`
      select account_status from companies.companies where id = ${companyId}
    `.execute(this.db);
    const row = rows[0];
    return row === undefined ? null : asStatus(row.account_status);
  }

  async getAll(): Promise<readonly AccountState[]> {
    const { rows } = await sql<StateRow>`
      select ${COLUMNS} from companies.companies order by created_at desc
    `.execute(this.db);
    return rows.map(toState);
  }

  async save(state: AccountState): Promise<void> {
    await sql`
      update companies.companies set
        account_status = ${state.status},
        trial_ends_on = ${state.trialEndsOn},
        overdue_since = ${state.overdueSince},
        paused_at = ${state.pausedAt},
        status_note = ${state.note},
        status_hold = ${state.hold}
      where id = ${state.companyId}
    `.execute(this.db);
  }

  async listMoves(companyId: CompanyId, limit: number): Promise<readonly AccountStateMove[]> {
    const { rows } = await sql<{
      id: string;
      from_status: string | null;
      to_status: string;
      by_staff_id: string | null;
      note: string;
      at: Date;
    }>`
      select id, from_status, to_status, by_staff_id, note, at
      from companies.account_state_log where company_id = ${companyId}
      order by at desc limit ${limit}
    `.execute(this.db);
    return rows.map((r) => ({
      id: r.id,
      companyId,
      from: r.from_status === null ? null : asStatus(r.from_status),
      to: asStatus(r.to_status),
      byStaffId: r.by_staff_id,
      note: r.note,
      at: r.at,
    }));
  }

  async appendMove(move: AccountStateMove): Promise<void> {
    await sql`
      insert into companies.account_state_log (id, company_id, from_status, to_status, by_staff_id, note, at)
      values (${move.id}, ${move.companyId}, ${move.from}, ${move.to}, ${move.byStaffId}, ${move.note}, ${move.at})
    `.execute(this.db);
  }

  async getSettings(): Promise<AccountSettings> {
    const { rows } = await sql<{
      default_trial_days: number;
      grace_days: number;
      automation: string;
    }>`
      select default_trial_days, grace_days, automation from companies.account_settings where only_row
    `.execute(this.db);
    const row = rows[0];
    return row === undefined
      ? DEFAULT_ACCOUNT_SETTINGS
      : {
          defaultTrialDays: row.default_trial_days,
          graceDays: row.grace_days,
          automation: ACCOUNT_AUTOMATION_MODES.find((m) => m === row.automation) ?? 'off',
        };
  }

  async saveSettings(settings: AccountSettings, byStaffId: string, at: Date): Promise<void> {
    await sql`
      update companies.account_settings set
        default_trial_days = ${settings.defaultTrialDays},
        grace_days = ${settings.graceDays},
        automation = ${settings.automation},
        updated_at = ${at},
        updated_by = ${byStaffId}
      where only_row
    `.execute(this.db);
  }
}
