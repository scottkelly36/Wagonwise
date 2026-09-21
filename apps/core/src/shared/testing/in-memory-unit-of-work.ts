import type { Transaction, UnitOfWork } from '../ports/unit-of-work.js';

/**
 * Enforces the `UnitOfWork` contract without a database, and records what happened so a test
 * can assert a use case committed (or rolled back) rather than merely returned.
 *
 * It does not undo in-memory repository writes on rollback — fakes for repositories that need
 * that will own it themselves. What it guarantees is the contract's control flow.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  committed = 0;
  rolledBack = 0;
  #active = false;

  async run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    if (this.#active) {
      throw new Error('UnitOfWork.run must not be nested');
    }
    this.#active = true;
    try {
      const value = await work({} as Transaction);
      this.committed++;
      return value;
    } catch (error) {
      this.rolledBack++;
      throw error;
    } finally {
      this.#active = false;
    }
  }
}
