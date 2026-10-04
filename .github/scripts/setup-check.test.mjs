import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { inspectServiceAccount, renderSummary } from './setup-check.mjs';

const good = JSON.stringify({
  type: 'service_account',
  client_email: 'publisher@wagonwise.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
});

describe('inspectServiceAccount', () => {
  it('accepts a service account key and returns its public email', () => {
    assert.deepEqual(inspectServiceAccount(good), {
      ok: true,
      email: 'publisher@wagonwise.iam.gserviceaccount.com',
    });
  });

  it('says so when the secret is missing or empty', () => {
    assert.equal(inspectServiceAccount(undefined).ok, false);
    assert.match(inspectServiceAccount('  ').problem, /missing or empty/);
  });

  it('says so when the paste is not JSON', () => {
    assert.match(inspectServiceAccount('{"type": "service_account"').problem, /not valid JSON/);
    assert.match(inspectServiceAccount('hello').problem, /not valid JSON/);
  });

  it('refuses a JSON file that is not a service account key', () => {
    const oauth = JSON.stringify({ installed: { client_id: 'x' } });
    assert.match(inspectServiceAccount(oauth).problem, /not a service account key/);
  });

  it('refuses a key with its parts missing', () => {
    const noKey = JSON.stringify({ type: 'service_account', client_email: 'a@b.c' });
    assert.match(inspectServiceAccount(noKey).problem, /missing its client_email or private_key/);
    const badKey = JSON.stringify({
      type: 'service_account',
      client_email: 'a@b.c',
      private_key: 'nope',
    });
    assert.match(inspectServiceAccount(badKey).problem, /does not look like a private key/);
  });

  it('never puts the private key in anything it returns', () => {
    assert.ok(!JSON.stringify(inspectServiceAccount(good)).includes('PRIVATE KEY'));
  });
});

describe('renderSummary', () => {
  it('shows a tick for each working part and the email to compare with Play', () => {
    const text = renderSummary({ expoUser: 'scottkelly36', account: inspectServiceAccount(good) });
    assert.match(text, /✅ \*\*Expo token\*\* works: signed in as `scottkelly36`/);
    assert.match(text, /publisher@wagonwise\.iam\.gserviceaccount\.com/);
  });

  it('shows what is wrong, not just that something is', () => {
    const text = renderSummary({
      expoProblem: 'EXPO_TOKEN is not set.',
      account: inspectServiceAccount('hello'),
    });
    assert.match(text, /❌ \*\*Expo token\*\*: EXPO_TOKEN is not set/);
    assert.match(text, /❌ \*\*Google Play key\*\*: .*not valid JSON/);
  });
});
