import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../shared/testing/sequential-id-generator.js';
import { composeCore } from './compose-core.js';

const config = loadConfig({ LOG_LEVEL: 'silent' });

describe('composeCore', () => {
  it('wires the fakes through to the host, so the whole stack runs deterministically', async () => {
    const { app } = composeCore(config, {
      clock: new FakeClock('2026-06-15T08:30:00.000Z'),
      ids: new SequentialIdGenerator(),
    });

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.json()).toMatchObject({ time: '2026-06-15T08:30:00.000Z' });
    expect(response.headers['x-request-id']).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('falls back to the real adapters when nothing is overridden', async () => {
    const { app } = composeCore(config);
    const before = Date.now();
    const response = await app.inject({ method: 'GET', url: '/health' });
    const time = Date.parse(response.json<{ time: string }>().time);

    expect(time).toBeGreaterThanOrEqual(before);
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
