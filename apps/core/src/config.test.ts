import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, PRODUCT_NAME } from './config.js';

const ED25519_PEM = generateKeyPairSync('ed25519')
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();
// A validly-formed PEM, but the wrong key type — must be rejected specifically for that, not
// merely for being unparseable.
const RSA_PEM = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();

describe('loadConfig', () => {
  it('needs nothing set: every variable has a safe local default', () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 3001,
      logLevel: 'info',
      databaseUrl: 'postgres://wagonwise:wagonwise@127.0.0.1:5432/wagonwise',
      identityPrivateKeyPem: undefined,
      internalKeys: ['local-dev-internal-key'],
      valhallaUrl: 'http://127.0.0.1:8002',
      expoAccessToken: undefined,
      anthropicApiKey: undefined,
      clickSendUsername: undefined,
      clickSendApiKey: undefined,
      resendApiKey: undefined,
      resendFromEmail: undefined,
      outboxPollIntervalMs: 2000,
    });
  });

  it('reads overrides, coercing PORT from its string form', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: '8080',
      LOG_LEVEL: 'warn',
      DATABASE_URL: 'postgresql://user:pw@db.internal:5432/wagonwise',
      IDENTITY_PRIVATE_KEY: ED25519_PEM,
      INTERNAL_KEYS: 'key-one, key-two',
      VALHALLA_URL: 'http://valhalla.internal:8002',
      EXPO_ACCESS_TOKEN: 'expo-secret-token',
      ANTHROPIC_API_KEY: 'anthropic-secret-key',
      CLICKSEND_USERNAME: 'driver@example.com',
      CLICKSEND_API_KEY: 'clicksend-secret-key',
      RESEND_API_KEY: 'resend-secret-key',
      RESEND_FROM_EMAIL: 'WagonWise <noreply@wagon-wise.co.uk>',
      OUTBOX_POLL_INTERVAL_MS: '500',
    });
    expect(config).toEqual({
      nodeEnv: 'production',
      host: '0.0.0.0',
      port: 8080,
      logLevel: 'warn',
      databaseUrl: 'postgresql://user:pw@db.internal:5432/wagonwise',
      identityPrivateKeyPem: ED25519_PEM,
      internalKeys: ['key-one', 'key-two'],
      valhallaUrl: 'http://valhalla.internal:8002',
      expoAccessToken: 'expo-secret-token',
      anthropicApiKey: 'anthropic-secret-key',
      clickSendUsername: 'driver@example.com',
      clickSendApiKey: 'clicksend-secret-key',
      resendApiKey: 'resend-secret-key',
      resendFromEmail: 'WagonWise <noreply@wagon-wise.co.uk>',
      outboxPollIntervalMs: 500,
    });
  });

  it('defaults INTERNAL_KEYS to a single well-known local-dev value', () => {
    expect(loadConfig({}).internalKeys).toEqual(['local-dev-internal-key']);
  });

  it('splits INTERNAL_KEYS on commas and trims whitespace, dropping empty entries', () => {
    expect(loadConfig({ INTERNAL_KEYS: ' a , b ,, c ' }).internalKeys).toEqual(['a', 'b', 'c']);
  });

  it('rejects an INTERNAL_KEYS that is only commas/whitespace (no real key survives)', () => {
    expect(() => loadConfig({ INTERNAL_KEYS: ' , , ' })).toThrow(ConfigError);
  });

  it('rejects an empty INTERNAL_KEYS', () => {
    expect(() => loadConfig({ INTERNAL_KEYS: '' })).toThrow(ConfigError);
  });

  it('leaves IDENTITY_PRIVATE_KEY undefined when unset', () => {
    expect(loadConfig({}).identityPrivateKeyPem).toBeUndefined();
  });

  it('accepts a real Ed25519 PKCS8 PEM', () => {
    expect(() => loadConfig({ IDENTITY_PRIVATE_KEY: ED25519_PEM })).not.toThrow();
  });

  it('accepts the same PEM with real newlines replaced by literal \\n (the env-var form)', () => {
    const escaped = ED25519_PEM.replaceAll('\n', '\\n');
    const config = loadConfig({ IDENTITY_PRIVATE_KEY: escaped });
    expect(config.identityPrivateKeyPem).toBe(ED25519_PEM); // normalised back to real newlines
  });

  it.each([
    ['garbage', 'not-a-pem-at-all'],
    ['an RSA key, the wrong algorithm', RSA_PEM],
    ['empty', ''],
  ])('rejects an IDENTITY_PRIVATE_KEY that is %s', (_label, value) => {
    expect(() => loadConfig({ IDENTITY_PRIVATE_KEY: value })).toThrow(ConfigError);
  });

  it('defaults DATABASE_URL to match infra/docker/compose.yml, so a fresh clone just works', () => {
    expect(loadConfig({}).databaseUrl).toBe(
      'postgres://wagonwise:wagonwise@127.0.0.1:5432/wagonwise',
    );
  });

  it.each([
    ['not a URL at all', 'not-a-url'],
    ['the wrong protocol', 'mysql://user:pw@127.0.0.1:3306/wagonwise'],
    ['http, which is not a database', 'http://127.0.0.1:5432/wagonwise'],
    ['empty', ''],
  ])('rejects a DATABASE_URL that is %s', (_label, databaseUrl) => {
    expect(() => loadConfig({ DATABASE_URL: databaseUrl })).toThrow(ConfigError);
  });

  it('accepts both the postgres:// and postgresql:// schemes', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/wagonwise' }),
    ).not.toThrow();
    expect(() =>
      loadConfig({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/wagonwise' }),
    ).not.toThrow();
  });

  it('defaults VALHALLA_URL to match infra/docker/compose.yml’s published port, so a fresh clone just works', () => {
    expect(loadConfig({}).valhallaUrl).toBe('http://127.0.0.1:8002');
  });

  it('rejects a VALHALLA_URL that is not a URL at all', () => {
    expect(() => loadConfig({ VALHALLA_URL: 'not-a-url' })).toThrow(ConfigError);
  });

  it('accepts a VALHALLA_URL override', () => {
    expect(loadConfig({ VALHALLA_URL: 'http://valhalla.internal:8002' }).valhallaUrl).toBe(
      'http://valhalla.internal:8002',
    );
  });

  it('defaults EXPO_ACCESS_TOKEN to undefined — Expo’s push API works without one', () => {
    expect(loadConfig({}).expoAccessToken).toBeUndefined();
  });

  it('accepts an EXPO_ACCESS_TOKEN override', () => {
    expect(loadConfig({ EXPO_ACCESS_TOKEN: 'expo-secret-token' }).expoAccessToken).toBe(
      'expo-secret-token',
    );
  });

  it('rejects an empty-string EXPO_ACCESS_TOKEN', () => {
    expect(() => loadConfig({ EXPO_ACCESS_TOKEN: '' })).toThrow(ConfigError);
  });

  it('defaults ANTHROPIC_API_KEY to undefined — voice reports fall back to NullHazardParser', () => {
    expect(loadConfig({}).anthropicApiKey).toBeUndefined();
  });

  it('accepts an ANTHROPIC_API_KEY override', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: 'anthropic-secret-key' }).anthropicApiKey).toBe(
      'anthropic-secret-key',
    );
  });

  it('rejects an empty-string ANTHROPIC_API_KEY', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: '' })).toThrow(ConfigError);
  });

  it('defaults CLICKSEND_USERNAME and CLICKSEND_API_KEY to undefined — OTPs fall back to ConsoleOtpSender', () => {
    const config = loadConfig({});
    expect(config.clickSendUsername).toBeUndefined();
    expect(config.clickSendApiKey).toBeUndefined();
  });

  it('accepts CLICKSEND_USERNAME and CLICKSEND_API_KEY overrides', () => {
    const config = loadConfig({
      CLICKSEND_USERNAME: 'driver@example.com',
      CLICKSEND_API_KEY: 'clicksend-secret-key',
    });
    expect(config.clickSendUsername).toBe('driver@example.com');
    expect(config.clickSendApiKey).toBe('clicksend-secret-key');
  });

  it('rejects an empty-string CLICKSEND_USERNAME or CLICKSEND_API_KEY', () => {
    expect(() => loadConfig({ CLICKSEND_USERNAME: '' })).toThrow(ConfigError);
    expect(() => loadConfig({ CLICKSEND_API_KEY: '' })).toThrow(ConfigError);
  });

  it('defaults RESEND_API_KEY and RESEND_FROM_EMAIL to undefined — email OTPs fall back to ConsoleOtpSender', () => {
    const config = loadConfig({});
    expect(config.resendApiKey).toBeUndefined();
    expect(config.resendFromEmail).toBeUndefined();
  });

  it('accepts RESEND_API_KEY and RESEND_FROM_EMAIL overrides', () => {
    const config = loadConfig({
      RESEND_API_KEY: 'resend-secret-key',
      RESEND_FROM_EMAIL: 'WagonWise <noreply@wagon-wise.co.uk>',
    });
    expect(config.resendApiKey).toBe('resend-secret-key');
    expect(config.resendFromEmail).toBe('WagonWise <noreply@wagon-wise.co.uk>');
  });

  it('rejects an empty-string RESEND_API_KEY or RESEND_FROM_EMAIL', () => {
    expect(() => loadConfig({ RESEND_API_KEY: '' })).toThrow(ConfigError);
    expect(() => loadConfig({ RESEND_FROM_EMAIL: '' })).toThrow(ConfigError);
  });

  it('defaults OUTBOX_POLL_INTERVAL_MS to 2000', () => {
    expect(loadConfig({}).outboxPollIntervalMs).toBe(2000);
  });

  it('coerces and accepts an OUTBOX_POLL_INTERVAL_MS override', () => {
    expect(loadConfig({ OUTBOX_POLL_INTERVAL_MS: '5000' }).outboxPollIntervalMs).toBe(5000);
  });

  it('rejects an OUTBOX_POLL_INTERVAL_MS below the 100ms floor', () => {
    expect(() => loadConfig({ OUTBOX_POLL_INTERVAL_MS: '10' })).toThrow(ConfigError);
  });

  it('ignores unrelated environment variables', () => {
    expect(() => loadConfig({ PATH: '/usr/bin', HOME: '/home/x' })).not.toThrow();
  });

  it.each([
    ['not a number', 'abc'],
    ['zero', '0'],
    ['out of range', '70000'],
    ['fractional', '80.5'],
    ['empty', ''],
  ])('rejects a PORT that is %s', (_label, port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(ConfigError);
  });

  it('rejects an unknown LOG_LEVEL and an unknown NODE_ENV', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'loud' })).toThrow(ConfigError);
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(ConfigError);
  });

  it('reports every problem at once, naming each variable', () => {
    try {
      loadConfig({ PORT: 'abc', LOG_LEVEL: 'loud' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const problems = (error as ConfigError).problems.join('\n');
      expect(problems).toContain('PORT');
      expect(problems).toContain('LOG_LEVEL');
    }
  });
});

describe('PRODUCT_NAME', () => {
  it('is the single home of the working name', () => {
    expect(PRODUCT_NAME).toBe('WagonWise');
  });
});
