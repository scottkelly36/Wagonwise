import type { Brand } from '../brand.js';

/**
 * An open database transaction, opaque to everything except the adapter that created it.
 * Repositories accept one so several writes commit or roll back together.
 */
export type Transaction = Brand<object, 'Transaction'>;

/**
 * Needed only for genuinely multi-aggregate operations — hazard merge touches two aggregates,
 * ending a trip touches the trip and its positions. A single-aggregate use case does not need
 * one: `repository.save()` already writes the rows and their outbox events in one transaction.
 *
 * Contract: `work` runs inside one transaction. If it resolves, the transaction commits; if it
 * throws or rejects, the transaction rolls back and the error propagates unchanged. `run` calls
 * must not be nested.
 */
export interface UnitOfWork {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
}
