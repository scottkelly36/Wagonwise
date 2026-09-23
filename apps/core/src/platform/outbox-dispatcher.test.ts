import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { createDb, createPool } from './db.js';
import { runMigrations } from './migrations/run-migrations.js';
import {
  OutboxDispatcher,
  type OutboxEventHandler,
  type StoredDomainEvent,
} from './outbox-dispatcher.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

/** A minimal, deterministic handler for tests — records every call and either succeeds, throws,
 *  or throws N times before succeeding. */
function fakeHandler(
  handlerName: string,
  eventType: string,
  behaviour: 'succeed' | 'always-fail' | { failTimes: number } = 'succeed',
): OutboxEventHandler & { readonly calls: StoredDomainEvent[] } {
  const calls: StoredDomainEvent[] = [];
  let remainingFailures =
    behaviour === 'always-fail'
      ? Infinity
      : typeof behaviour === 'object'
        ? behaviour.failTimes
        : 0;
  return {
    handlerName,
    eventType,
    calls,
    handle(event) {
      calls.push(event);
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        return Promise.reject(new Error('handler failure'));
      }
      return Promise.resolve();
    },
  };
}

async function insertEvent(
  pool: Pool,
  overrides: { eventType?: string; payload?: unknown; createdAt?: Date } = {},
): Promise<string> {
  const eventId = randomUUID();
  await pool.query(
    `insert into outbox.events (event_id, aggregate_type, aggregate_id, event_type, payload, created_at)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      eventId,
      'TestAggregate',
      'aggregate-1',
      overrides.eventType ?? 'TestEvent',
      JSON.stringify(overrides.payload ?? {}),
      overrides.createdAt ?? new Date(),
    ],
  );
  return eventId;
}

async function isProcessed(pool: Pool, eventId: string): Promise<boolean> {
  const { rows } = await pool.query<{ processed_at: Date | null }>(
    'select processed_at from outbox.events where event_id = $1',
    [eventId],
  );
  return rows[0]?.processed_at !== null;
}

async function attemptsFor(pool: Pool, eventId: string): Promise<number> {
  const { rows } = await pool.query<{ attempts: number }>(
    'select attempts from outbox.events where event_id = $1',
    [eventId],
  );
  return rows[0]?.attempts ?? -1;
}

describe('OutboxDispatcher', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    db = createDb(pool);
    await runMigrations(pool, migrationsDir);
  }, 120_000);

  afterAll(async () => {
    await db.destroy();
    await container.stop();
  });

  afterEach(async () => {
    await pool.query('delete from outbox.handled');
    await pool.query('delete from outbox.events');
  });

  it('runs the matching handler once and marks the event processed', async () => {
    const eventId = await insertEvent(pool, { eventType: 'TestEvent' });
    const handler = fakeHandler('test-handler', 'TestEvent');
    const dispatcher = new OutboxDispatcher(db, [handler], new FakeClock());

    await dispatcher.drainOnce();

    expect(handler.calls).toHaveLength(1);
    expect(handler.calls[0]?.eventId).toBe(eventId);
    expect(await isProcessed(pool, eventId)).toBe(true);
  });

  it('ignores an event with no matching handler and marks it processed anyway', async () => {
    const eventId = await insertEvent(pool, { eventType: 'NobodyListens' });
    const dispatcher = new OutboxDispatcher(db, [], new FakeClock());

    await dispatcher.drainOnce();

    expect(await isProcessed(pool, eventId)).toBe(true);
  });

  it('does not call an already-handled handler again on a later pass', async () => {
    const eventId = await insertEvent(pool, { eventType: 'TestEvent' });
    const succeeding = fakeHandler('succeeds', 'TestEvent', 'succeed');
    const failing = fakeHandler('fails-once', 'TestEvent', { failTimes: 1 });
    const dispatcher = new OutboxDispatcher(db, [succeeding, failing], new FakeClock());

    await dispatcher.drainOnce(); // succeeding handler succeeds; failing handler fails once
    expect(succeeding.calls).toHaveLength(1);
    expect(failing.calls).toHaveLength(1);
    expect(await isProcessed(pool, eventId)).toBe(false); // not fully handled yet

    await dispatcher.drainOnce(); // retried — succeeding handler must not run again
    expect(succeeding.calls).toHaveLength(1);
    expect(failing.calls).toHaveLength(2);
    expect(await isProcessed(pool, eventId)).toBe(true);
  });

  it('dead-letters after maxAttempts, without ever recording success', async () => {
    const eventId = await insertEvent(pool, { eventType: 'TestEvent' });
    const handler = fakeHandler('always-fails', 'TestEvent', 'always-fail');
    const dispatcher = new OutboxDispatcher(db, [handler], new FakeClock(), 3);

    await dispatcher.drainOnce();
    await dispatcher.drainOnce();
    expect(await isProcessed(pool, eventId)).toBe(false);

    await dispatcher.drainOnce(); // 3rd attempt — dead-lettered even though it still failed
    expect(handler.calls).toHaveLength(3);
    expect(await attemptsFor(pool, eventId)).toBe(3);
    expect(await isProcessed(pool, eventId)).toBe(true);

    await dispatcher.drainOnce(); // dead-lettered event is no longer claimed at all
    expect(handler.calls).toHaveLength(3);
  });

  it('processes pending events oldest first', async () => {
    const older = await insertEvent(pool, {
      eventType: 'TestEvent',
      createdAt: new Date('2026-06-15T08:00:00.000Z'),
    });
    const newer = await insertEvent(pool, {
      eventType: 'TestEvent',
      createdAt: new Date('2026-06-15T09:00:00.000Z'),
    });
    const handler = fakeHandler('order-checker', 'TestEvent');
    const dispatcher = new OutboxDispatcher(db, [handler], new FakeClock());

    await dispatcher.drainOnce();

    expect(handler.calls.map((e) => e.eventId)).toEqual([older, newer]);
  });

  it('start()/stop() polls on an interval and can be stopped cleanly', async () => {
    const eventId = await insertEvent(pool, { eventType: 'TestEvent' });
    const handler = fakeHandler('interval-handler', 'TestEvent');
    const dispatcher = new OutboxDispatcher(db, [handler], new FakeClock());

    dispatcher.start(10);
    await new Promise((resolve) => setTimeout(resolve, 100));
    dispatcher.stop();

    expect(handler.calls.length).toBeGreaterThanOrEqual(1);
    expect(await isProcessed(pool, eventId)).toBe(true);
  });
});
