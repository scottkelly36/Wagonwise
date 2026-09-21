import { describe, expect, it } from 'vitest';
import { InMemoryUnitOfWork } from './in-memory-unit-of-work.js';

describe('InMemoryUnitOfWork', () => {
  it('returns the value of the work and records a commit', async () => {
    const uow = new InMemoryUnitOfWork();
    await expect(uow.run(() => Promise.resolve(42))).resolves.toBe(42);
    expect(uow.committed).toBe(1);
    expect(uow.rolledBack).toBe(0);
  });

  it('records a rollback and propagates the original error unchanged', async () => {
    const uow = new InMemoryUnitOfWork();
    const boom = new Error('boom');
    await expect(uow.run(() => Promise.reject(boom))).rejects.toBe(boom);
    expect(uow.committed).toBe(0);
    expect(uow.rolledBack).toBe(1);
  });

  it('hands the work a transaction to pass to repositories', async () => {
    const uow = new InMemoryUnitOfWork();
    await uow.run((tx) => {
      expect(tx).toBeDefined();
      return Promise.resolve();
    });
  });

  it('forbids nesting, as the port contract says', async () => {
    const uow = new InMemoryUnitOfWork();
    await expect(uow.run(() => uow.run(() => Promise.resolve()))).rejects.toThrow('nested');
    // The outer transaction failed because of the inner call, so it rolls back.
    expect(uow.committed).toBe(0);
    expect(uow.rolledBack).toBe(1);
  });

  it('can be reused after a failure', async () => {
    const uow = new InMemoryUnitOfWork();
    await expect(uow.run(() => Promise.reject(new Error('first')))).rejects.toThrow('first');
    await expect(uow.run(() => Promise.resolve('second'))).resolves.toBe('second');
    expect(uow.committed).toBe(1);
    expect(uow.rolledBack).toBe(1);
  });
});
