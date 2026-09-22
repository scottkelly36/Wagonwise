import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../shared/testing/sequential-id-generator.js';
import { composeCore, type Core } from './compose-core.js';

const config = loadConfig({ LOG_LEVEL: 'silent' });

const fakeTokenSigner = {
  signAccessToken: () => Promise.resolve('fake-access-token'),
  publicJwk: () => Promise.resolve({ kty: 'OKP', crv: 'Ed25519', x: 'fake' }),
};

// composeCore opens a real pg.Pool (lazily — no connection until first query, so this needs no
// running Postgres), which must be closed or vitest's process hangs waiting for its socket.
let core: Core | undefined;
afterEach(async () => {
  await core?.close();
  core = undefined;
});

describe('composeCore', () => {
  it('wires the fakes through to the host, so the whole stack runs deterministically', async () => {
    core = composeCore(config, fakeTokenSigner, {
      clock: new FakeClock('2026-06-15T08:30:00.000Z'),
      ids: new SequentialIdGenerator(),
    });

    const response = await core.app.inject({ method: 'GET', url: '/health' });
    expect(response.json()).toMatchObject({ time: '2026-06-15T08:30:00.000Z' });
    expect(response.headers['x-request-id']).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('falls back to the real adapters when nothing is overridden', async () => {
    core = composeCore(config, fakeTokenSigner);
    const before = Date.now();
    const response = await core.app.inject({ method: 'GET', url: '/health' });
    const time = Date.parse(response.json<{ time: string }>().time);

    expect(time).toBeGreaterThanOrEqual(before);
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
