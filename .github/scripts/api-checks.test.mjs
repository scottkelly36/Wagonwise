import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { parseChecks, waitForChecks } from './api-checks.mjs';

describe('parseChecks', () => {
  it('reads method, path and status, ignoring comments and blank lines', () => {
    const checks = parseChecks('# a comment\n\nget  /health 200  # trailing\nPOST /jobs/x/y 401\n');
    assert.deepEqual(checks, [
      { method: 'GET', path: '/health', status: 200 },
      { method: 'POST', path: '/jobs/x/y', status: 401 },
    ]);
  });

  it('refuses a line it cannot understand, rather than skipping a check', () => {
    assert.throws(() => parseChecks('GET /health'), /Bad check line/);
    assert.throws(() => parseChecks('GET /health ok'), /Bad check line/);
  });

  it('parses the real checks file', () => {
    const text = readFileSync(new URL('../release/api-checks.txt', import.meta.url), 'utf8');
    assert.ok(parseChecks(text).length >= 3);
  });
});

describe('waitForChecks', () => {
  const checks = [{ method: 'GET', path: '/jobs/current', status: 401 }];
  const quiet = () => undefined;

  it('passes straight away when the server already answers correctly', async () => {
    const failing = await waitForChecks('https://x', checks, {
      timeoutMs: 1000,
      intervalMs: 10,
      log: quiet,
      fetchStatus: async () => 401,
      sleep: async () => undefined,
    });
    assert.deepEqual(failing, []);
  });

  it('waits through a deploy: a 404 first, then the route appears', async () => {
    const answers = [404, 404, 401];
    let sleeps = 0;
    const failing = await waitForChecks('https://x', checks, {
      timeoutMs: 60_000,
      intervalMs: 10,
      log: quiet,
      fetchStatus: async () => answers.shift(),
      sleep: async () => {
        sleeps += 1;
      },
    });
    assert.deepEqual(failing, []);
    assert.equal(sleeps, 2);
  });

  it('gives up at the deadline and says which check is still failing', async () => {
    let clock = 0;
    const failing = await waitForChecks('https://x', checks, {
      timeoutMs: 100,
      intervalMs: 50,
      log: quiet,
      fetchStatus: async () => 404,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    assert.equal(failing.length, 1);
    assert.equal(failing[0].got, 404);
    assert.equal(failing[0].check.path, '/jobs/current');
  });

  it('treats an unreachable server as failing, not as a crash', async () => {
    let clock = 0;
    const failing = await waitForChecks('https://x', checks, {
      timeoutMs: 10,
      intervalMs: 10,
      log: quiet,
      fetchStatus: async () => {
        throw new Error('ECONNREFUSED');
      },
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    assert.equal(failing.length, 1);
    assert.match(String(failing[0].got), /ECONNREFUSED/);
  });
});
