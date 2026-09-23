import { sql, type Kysely } from 'kysely';
import type { DomainEvent } from '../shared/domain-event.js';
import type { Clock } from '../shared/ports/clock.js';
import type { Database } from './db.js';

export interface StoredDomainEvent extends DomainEvent {
  readonly createdAt: Date;
  readonly attempts: number;
}

/**
 * One handler for one event type. `handlerName` is the idempotency key alongside `eventId`
 * (`outbox.handled`'s own primary key) — at-least-once delivery means `handle()` may run twice
 * for the same event, so every handler must itself be idempotent (AGENTS.md rule 9); this
 * dispatcher only guarantees it won't *knowingly* re-run a handler that already recorded success.
 */
export interface OutboxEventHandler {
  readonly handlerName: string;
  readonly eventType: string;
  handle(event: StoredDomainEvent): Promise<void>;
}

interface OutboxEventRow {
  readonly event_id: string;
  readonly aggregate_type: string;
  readonly aggregate_id: string;
  readonly event_type: string;
  readonly payload: unknown;
  readonly created_at: Date;
  readonly attempts: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 50;

function toStoredDomainEvent(row: OutboxEventRow): StoredDomainEvent {
  return {
    eventId: row.event_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    payload: row.payload,
    createdAt: row.created_at,
    attempts: row.attempts,
  };
}

/**
 * The in-process outbox poller (design doc §11, decision 5): claims pending `outbox.events` rows
 * and runs every registered handler whose `eventType` matches, oldest event first. Lives in
 * `platform/`, not a module, since it dispatches to potentially many modules' handlers and no
 * single bounded context owns it — `composition/` is what actually knows the full handler list
 * (one module's facade exporting handlers, another's composition wiring them in), the same
 * "composition root is the one place that knows which concrete adapter satisfies which port"
 * reasoning as everything else it wires (AGENTS.md rule 5).
 *
 * `attempts` is a single counter per event row, not per handler — the schema
 * (`migrations/0001_init.sql`) only has one column for it. A concurrent second dispatcher
 * instance could in principle claim the same batch (SKIP LOCKED's lock is released once the
 * claiming transaction commits, not held across handler execution — deliberately, since holding
 * a DB transaction open across arbitrary handler work, including a future push-notification HTTP
 * call, is worse than the alternative), but correctness never depends on that: `outbox.handled`'s
 * own uniqueness is what stops a handler running twice, matching every other repository's
 * check-then-act calls in this codebase (decision 54's same reasoning for `ActiveTrip`).
 */
export class OutboxDispatcher {
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly db: Kysely<Database>,
    private readonly handlers: readonly OutboxEventHandler[],
    private readonly clock: Clock,
    private readonly maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
    private readonly batchSize: number = DEFAULT_BATCH_SIZE,
  ) {}

  /** One full pass over whatever's currently pending. `start()` calls this on an interval in
   *  production; tests call it directly instead of waiting on a timer (decision 5's own
   *  "drainOnce() for tests"). */
  async drainOnce(): Promise<void> {
    const claimed = await this.#claimBatch();
    for (const event of claimed) {
      await this.#processEvent(event);
    }
  }

  async #claimBatch(): Promise<StoredDomainEvent[]> {
    return this.db.transaction().execute(async (trx) => {
      const { rows } = await sql<OutboxEventRow>`
        select event_id, aggregate_type, aggregate_id, event_type, payload, created_at, attempts
        from outbox.events
        where processed_at is null
        order by created_at asc
        limit ${this.batchSize}
        for update skip locked
      `.execute(trx);

      const eventIds = rows.map((row) => row.event_id);
      if (eventIds.length > 0) {
        // Bumped on claim, not on completion — a crash mid-handler must still count as an
        // attempt, or a handler that reliably crashes the process would retry forever instead
        // of eventually dead-lettering.
        await sql`
          update outbox.events set attempts = attempts + 1
          where event_id in (${sql.join(eventIds)})
        `.execute(trx);
      }

      return rows.map((row) => toStoredDomainEvent({ ...row, attempts: row.attempts + 1 }));
    });
  }

  async #processEvent(event: StoredDomainEvent): Promise<void> {
    const matching = this.handlers.filter((handler) => handler.eventType === event.eventType);

    let allHandled = true;
    for (const handler of matching) {
      if (await this.#isHandled(event.eventId, handler.handlerName)) {
        continue;
      }
      try {
        await handler.handle(event);
        await this.#markHandled(event.eventId, handler.handlerName);
      } catch {
        allHandled = false;
      }
    }

    if (allHandled || event.attempts >= this.maxAttempts) {
      await sql`
        update outbox.events set processed_at = ${this.clock.now()} where event_id = ${event.eventId}
      `.execute(this.db);
    }
  }

  async #isHandled(eventId: string, handlerName: string): Promise<boolean> {
    const { rows } = await sql`
      select 1 from outbox.handled where event_id = ${eventId} and handler_name = ${handlerName}
    `.execute(this.db);
    return rows.length > 0;
  }

  async #markHandled(eventId: string, handlerName: string): Promise<void> {
    await sql`
      insert into outbox.handled (event_id, handler_name) values (${eventId}, ${handlerName})
      on conflict do nothing
    `.execute(this.db);
  }

  /** Production scheduling. `composeCore`'s `close()` calls `stop()`. */
  start(intervalMs: number): void {
    if (this.#timer !== undefined) return;
    this.#timer = setInterval(() => void this.drainOnce(), intervalMs);
  }

  stop(): void {
    if (this.#timer !== undefined) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }
}
