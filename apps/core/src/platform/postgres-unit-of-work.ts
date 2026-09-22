import type { Kysely, Transaction as KyselyTransaction } from 'kysely';
import type { Transaction, UnitOfWork } from '../shared/ports/unit-of-work.js';
import type { Database } from './db.js';

/**
 * The real `UnitOfWork` (AGENTS.md rule 3, decision M1.3 §18): wraps one Postgres transaction
 * per `run()` call via Kysely, satisfying the same contract `InMemoryUnitOfWork` enforces in
 * tests — commit on success, rollback on throw, no nesting.
 *
 * `Transaction` is deliberately opaque in `shared/ports/` (the kernel takes no npm dependency,
 * not even Kysely's types) — this is the one place that knows what it really is. A module's
 * `infrastructure/` recovers it with `asKyselyTransaction`, never by importing this file
 * (`modules/` may not import `platform/` — AGENTS.md rule "modules-no-outward").
 */
export class PostgresUnitOfWork implements UnitOfWork {
  #active = false;

  constructor(private readonly db: Kysely<Database>) {}

  async run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    if (this.#active) {
      throw new Error('UnitOfWork.run must not be nested');
    }
    this.#active = true;
    try {
      return await this.db.transaction().execute((trx) => work(asTransaction(trx)));
    } finally {
      this.#active = false;
    }
  }
}

/** The cast lives in one named function so every use of it is grep-able. */
function asTransaction(trx: KyselyTransaction<Database>): Transaction {
  return trx as unknown as Transaction;
}

/**
 * The other half of `asTransaction`: a module's `infrastructure/` calls this on the
 * `Transaction` a `UnitOfWork.run()` callback receives, to get back a typed Kysely handle for
 * its own tables. Safe only because `PostgresUnitOfWork` is the sole producer of a real
 * `Transaction` outside tests — swap in `InMemoryUnitOfWork` and this must never be called.
 */
export function asKyselyTransaction(tx: Transaction): KyselyTransaction<Database> {
  return tx as unknown as KyselyTransaction<Database>;
}
