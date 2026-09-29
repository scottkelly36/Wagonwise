import { AsyncLocalStorage } from 'node:async_hooks';
import type { PostgresPool, PostgresPoolClient } from 'kysely';
import type { Pool, PoolClient } from 'pg';
import type { DataScope, DataScopes } from '../shared/ports/data-scope.js';

/** The three settings migration 0021's policies read. Always all three, so none can linger. */
function settingsFor(scope: DataScope): [companyId: string, platform: string, staffAuth: string] {
  switch (scope.kind) {
    case 'company':
      return [scope.companyId, '', ''];
    case 'platform':
      return ['', 'on', ''];
    case 'staff-auth':
      return ['', '', 'on'];
  }
}

const TRANSACTION_CONTROL = /^\s*(begin|start\s+transaction|commit|end|rollback)\b/i;

/**
 * The real `DataScopes` (P2-M1.7). `run` takes one connection, opens a transaction, sets the
 * scope with `set_config(..., true)` (transaction-local, so it is gone at commit and can't leak
 * to the next user of the connection), and runs `work` with that connection remembered in
 * AsyncLocalStorage. `pool` is what Kysely is built on: inside a scope it hands out that same
 * connection, so every repository query in the request lands in the scoped transaction without
 * repositories knowing; outside a scope it's the plain pool, where RLS-protected tables show no
 * rows at all.
 */
export class PostgresDataScopes implements DataScopes {
  readonly #pool: Pool;
  readonly #current = new AsyncLocalStorage<PoolClient>();
  readonly pool: PostgresPool;

  constructor(pool: Pool) {
    this.#pool = pool;
    this.pool = {
      options: pool.options,
      end: () => pool.end(),
      connect: async (): Promise<PostgresPoolClient> => {
        const scoped = this.#current.getStore();
        if (scoped === undefined) return pool.connect();
        return {
          // Kysely's own transactions (e.g. `UnitOfWork.run`) would commit the scope's early.
          query: ((text: string, values: unknown[]) => {
            if (TRANSACTION_CONTROL.test(text)) {
              throw new Error('no transactions inside DataScopes.run: it is already one');
            }
            return scoped.query(text, values);
          }) as unknown as PostgresPoolClient['query'],
          // The scope owns the connection and releases it; Kysely's release is a no-op here.
          release: () => undefined,
        };
      },
    };
  }

  async run<T>(scope: DataScope, work: () => Promise<T>): Promise<T> {
    if (this.#current.getStore() !== undefined) {
      throw new Error('DataScopes.run must not be nested');
    }
    const client = await this.#pool.connect();
    let broken: Error | undefined;
    try {
      await client.query('begin');
      await client.query(
        `select set_config('app.company_id', $1, true),
                set_config('app.platform_staff', $2, true),
                set_config('app.staff_auth', $3, true)`,
        settingsFor(scope),
      );
      const value = await this.#current.run(client, work);
      // If a statement failed and `work` caught the error and carried on, Postgres has already
      // aborted the transaction, and COMMIT quietly becomes ROLLBACK (no error): every write in
      // the scope is gone. Surface that, rather than report success for nothing saved.
      const committed = await client.query('commit');
      if (committed.command === 'ROLLBACK') {
        throw new Error('the scope was rolled back: a statement inside it failed');
      }
      return value;
    } catch (error) {
      await client.query('rollback').catch((rollbackError: unknown) => {
        broken = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
      });
      throw error;
    } finally {
      // A connection whose rollback failed is in an unknown state: destroy it, don't reuse it.
      client.release(broken);
    }
  }
}
