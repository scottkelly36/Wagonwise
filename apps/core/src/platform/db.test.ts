import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachPoolErrorHandler, createPool } from './db.js';

// Nothing listens on this port and the pool opens no connection until it is asked for one, so these
// tests need no database. They are about what happens when a pool reports an error.
const URL = 'postgres://nobody:nothing@127.0.0.1:1/none';

describe('database pool errors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('would be an uncaught exception without a listener (why every pool needs one)', async () => {
    const { Pool } = await import('pg');
    const bare = new Pool({ connectionString: URL });
    expect(() => bare.emit('error', new Error('terminating connection'))).toThrow(
      'terminating connection',
    );
    await bare.end();
  });

  it('createPool survives an idle connection failing, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pool = createPool(URL);

    expect(() =>
      pool.emit('error', new Error('terminating connection due to administrator command')),
    ).not.toThrow();

    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0]?.[0])).toContain('terminating connection');
    await pool.end();
  });

  it('attachPoolErrorHandler hands the error to the handler it is given', async () => {
    const onError = vi.fn();
    const pool = createPool(URL);
    attachPoolErrorHandler(pool, onError);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    pool.emit('error', new Error('boom'));

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
    await pool.end();
  });
});
