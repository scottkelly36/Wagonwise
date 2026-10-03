import { sql } from 'kysely';
import { makeId } from '../../../shared/brand.js';
import type { DomainEvent } from '../../../shared/domain-event.js';
import type { HazardRepository } from '../application/ports/hazard-repository.js';
import {
  DISPUTED_MIN_EACH,
  type ModerationDecision,
  type ModeratedFields,
} from '../domain/moderation.js';
import {
  BLOCKING_HAZARD_TYPES,
  type GeoPoint,
  type HazardReport,
  type HazardReportId,
  type HazardStatus,
  type HazardType,
  type MeasurementKind,
  type Measurement,
  type MeasurementUnit,
  type ReportSource,
} from '../domain/hazard-report.js';
import type { UntypedDb } from './db.js';

interface HazardReportRow {
  readonly id: string;
  readonly reporter_id: string;
  readonly type: HazardType;
  readonly lat: number;
  readonly lon: number;
  readonly note: string | null;
  readonly measurement_kind: MeasurementKind | null;
  readonly measurement_value: number | null;
  readonly measurement_unit: MeasurementUnit | null;
  readonly source: ReportSource;
  readonly confirmations: number;
  readonly dismissals: number;
  readonly status: HazardStatus;
  readonly expires_at: Date | null;
  readonly created_at: Date;
}

const SELECT_COLUMNS = `
  id, reporter_id, type, ST_Y(location::geometry) as lat, ST_X(location::geometry) as lon,
  note, measurement_kind, measurement_value, measurement_unit, source, confirmations,
  dismissals, status, expires_at, created_at
`;

function toDomain(row: HazardReportRow): HazardReport {
  return {
    id: makeId<'HazardReportId'>(row.id),
    reporterId: makeId<'DriverId'>(row.reporter_id),
    type: row.type,
    location: { lat: row.lat, lon: row.lon },
    note: row.note ?? undefined,
    // measurement_together (0005_hazards.sql) guarantees these three travel together.
    measurement:
      row.measurement_kind !== null &&
      row.measurement_value !== null &&
      row.measurement_unit !== null
        ? { kind: row.measurement_kind, value: row.measurement_value, unit: row.measurement_unit }
        : undefined,
    source: row.source,
    confirmations: row.confirmations,
    dismissals: row.dismissals,
    status: row.status,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
  };
}

interface DecisionRow {
  readonly id: string;
  readonly hazard_id: string;
  readonly moderator_id: string;
  readonly action: ModerationDecision['action'];
  readonly note: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly decided_at: Date;
}

/** The audit snapshot as stored: plain JSON, dates as ISO strings. */
function snapshot(fields: ModeratedFields): Record<string, unknown> {
  return {
    type: fields.type,
    measurement: fields.measurement ?? null,
    status: fields.status,
    expiresAt: fields.expiresAt?.toISOString() ?? null,
  };
}

/** Reads a stored snapshot back, trusting nothing about its shape beyond what it can check. */
function fieldsFrom(value: unknown): ModeratedFields {
  const raw = (value ?? {}) as {
    type?: HazardType;
    measurement?: Measurement | null;
    status?: HazardStatus;
    expiresAt?: string | null;
  };
  return {
    type: raw.type ?? 'other',
    measurement: raw.measurement ?? undefined,
    status: raw.status ?? 'active',
    expiresAt: raw.expiresAt ? new Date(raw.expiresAt) : undefined,
  };
}

/** Raw `sql` tagged-template queries, not Kysely's typed query builder — same reasoning as every
 *  other repository in this codebase (decision 26, docs/progress.md). */
export class PostgresHazardRepository implements HazardRepository {
  constructor(private readonly db: UntypedDb) {}

  async findById(id: HazardReportId): Promise<HazardReport | null> {
    const { rows } = await sql<HazardReportRow>`
      select ${sql.raw(SELECT_COLUMNS)} from hazards.reports where id = ${id}
    `.execute(this.db);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findNearby(location: GeoPoint, radiusM: number): Promise<HazardReport[]> {
    const { rows } = await sql<HazardReportRow>`
      select ${sql.raw(SELECT_COLUMNS)} from hazards.reports
      where ST_DWithin(
        location,
        ST_SetSRID(ST_MakePoint(${location.lon}, ${location.lat}), 4326)::geography,
        ${radiusM}
      )
      order by created_at desc
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<HazardReport[]> {
    if (points.length === 0) {
      return [];
    }
    const [only, ...rest] = points;
    if (only && rest.length === 0) {
      return this.findNearby(only, radiusM);
    }
    const pointExprs = points.map((p) => sql`ST_MakePoint(${p.lon}, ${p.lat})`);
    const { rows } = await sql<HazardReportRow>`
      select ${sql.raw(SELECT_COLUMNS)} from hazards.reports
      where ST_DWithin(
        location,
        ST_SetSRID(ST_MakeLine(ARRAY[${sql.join(pointExprs)}]), 4326)::geography,
        ${radiusM}
      )
      order by created_at desc
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async findExpirable(now: Date): Promise<HazardReport[]> {
    const { rows } = await sql<HazardReportRow>`
      select ${sql.raw(SELECT_COLUMNS)} from hazards.reports
      where status = 'active' and expires_at is not null and expires_at <= ${now}
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async findAll(): Promise<HazardReport[]> {
    const { rows } = await sql<HazardReportRow>`
      select ${sql.raw(SELECT_COLUMNS)} from hazards.reports order by created_at desc
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async findAwaitingReview(): Promise<HazardReport[]> {
    const { rows } = await sql<HazardReportRow>`
      select ${sql.raw(SELECT_COLUMNS)} from hazards.reports r
      where r.status = 'active'
        and not exists (
          select 1 from hazards.moderation_decisions d
          where d.hazard_id = r.id and d.action = 'approve'
        )
        and (
          r.type in (${sql.join([...BLOCKING_HAZARD_TYPES])})
          or (r.confirmations >= ${DISPUTED_MIN_EACH} and r.dismissals >= ${DISPUTED_MIN_EACH})
        )
      order by r.created_at asc
    `.execute(this.db);
    return rows.map(toDomain);
  }

  async saveModerated(
    report: HazardReport,
    decision: ModerationDecision,
    events: readonly DomainEvent[],
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await this.#upsert(report, trx);
      await sql`
        insert into hazards.moderation_decisions
          (id, hazard_id, moderator_id, action, note, before, after, decided_at)
        values (
          ${decision.id}, ${decision.hazardId}, ${decision.moderatorId}, ${decision.action},
          ${decision.note ?? null}, ${JSON.stringify(snapshot(decision.before))}::jsonb,
          ${JSON.stringify(snapshot(decision.after))}::jsonb, ${decision.decidedAt}
        )
      `.execute(trx);
      for (const event of events) {
        await sql`
          insert into outbox.events (event_id, aggregate_type, aggregate_id, event_type, payload)
          values (${event.eventId}, ${event.aggregateType}, ${event.aggregateId}, ${event.eventType}, ${JSON.stringify(event.payload)})
        `.execute(trx);
      }
    });
  }

  async findDecisions(hazardId: HazardReportId): Promise<ModerationDecision[]> {
    const { rows } = await sql<DecisionRow>`
      select id, hazard_id, moderator_id, action, note, before, after, decided_at
      from hazards.moderation_decisions where hazard_id = ${hazardId}
      order by decided_at asc, id asc
    `.execute(this.db);
    return rows.map((row) => ({
      id: makeId<'ModerationDecisionId'>(row.id),
      hazardId: makeId<'HazardReportId'>(row.hazard_id),
      moderatorId: makeId<'StaffId'>(row.moderator_id),
      action: row.action,
      note: row.note ?? undefined,
      before: fieldsFrom(row.before),
      after: fieldsFrom(row.after),
      decidedAt: row.decided_at,
    }));
  }

  async deleteById(id: HazardReportId): Promise<void> {
    await sql`delete from hazards.reports where id = ${id}`.execute(this.db);
  }

  /** `events` (M6.3) are written to `outbox.events` in the same transaction as the row itself
   *  (decision 4) — a crash between the two must never lose an event or record one for a write
   *  that never happened. No transaction is opened at all when there's nothing to publish
   *  (dismiss/expire's calls), so the common case pays no extra round trip. */
  async save(report: HazardReport, events: readonly DomainEvent[] = []): Promise<void> {
    if (events.length === 0) {
      await this.#upsert(report, this.db);
      return;
    }
    await this.db.transaction().execute(async (trx) => {
      await this.#upsert(report, trx);
      for (const event of events) {
        await sql`
          insert into outbox.events (event_id, aggregate_type, aggregate_id, event_type, payload)
          values (${event.eventId}, ${event.aggregateType}, ${event.aggregateId}, ${event.eventType}, ${JSON.stringify(event.payload)})
        `.execute(trx);
      }
    });
  }

  async #upsert(report: HazardReport, executor: UntypedDb): Promise<void> {
    await sql`
      insert into hazards.reports
        (id, reporter_id, type, location, note, measurement_kind, measurement_value,
         measurement_unit, source, confirmations, dismissals, status, expires_at, created_at)
      values (
        ${report.id}, ${report.reporterId}, ${report.type},
        ST_SetSRID(ST_MakePoint(${report.location.lon}, ${report.location.lat}), 4326)::geography,
        ${report.note ?? null},
        ${report.measurement?.kind ?? null}, ${report.measurement?.value ?? null},
        ${report.measurement?.unit ?? null},
        ${report.source}, ${report.confirmations}, ${report.dismissals}, ${report.status},
        ${report.expiresAt ?? null}, ${report.createdAt}
      )
      on conflict (id) do update set
        type = excluded.type,
        location = excluded.location,
        note = excluded.note,
        measurement_kind = excluded.measurement_kind,
        measurement_value = excluded.measurement_value,
        measurement_unit = excluded.measurement_unit,
        source = excluded.source,
        confirmations = excluded.confirmations,
        dismissals = excluded.dismissals,
        status = excluded.status,
        expires_at = excluded.expires_at
    `.execute(executor);
  }
}
