import type { DataScope, DataScopes } from '../ports/data-scope.js';

/**
 * Enforces `DataScopes`' control-flow contract without a database (no nesting, errors propagate)
 * and records each scope used, so a route test can assert which scope a request ran in. The
 * in-memory repositories have no RLS, so this can't show that rows are actually filtered:
 * `composition/row-level-security.test.ts` does that against real Postgres.
 *
 * A plain flag, not per-async-context tracking: fine for tests that run one request at a time.
 */
export class RecordingDataScopes implements DataScopes {
  readonly used: DataScope[] = [];
  #active = false;

  async run<T>(scope: DataScope, work: () => Promise<T>): Promise<T> {
    if (this.#active) throw new Error('DataScopes.run must not be nested');
    this.used.push(scope);
    this.#active = true;
    try {
      return await work();
    } finally {
      this.#active = false;
    }
  }
}
