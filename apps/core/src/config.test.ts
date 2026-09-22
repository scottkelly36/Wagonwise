import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, PRODUCT_NAME } from './config.js';

describe('loadConfig', () => {
  it('needs nothing set: every variable has a safe local default', () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 3001,
      logLevel: 'info',
      databaseUrl: 'postgres://wagonwise:wagonwise@127.0.0.1:5432/wagonwise',
    });
  });

  it('reads overrides, coercing PORT from its string form', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: '8080',
      LOG_LEVEL: 'warn',
      DATABASE_URL: 'postgresql://user:pw@db.internal:5432/wagonwise',
    });
    expect(config).toEqual({
      nodeEnv: 'production',
      host: '0.0.0.0',
      port: 8080,
      logLevel: 'warn',
      databaseUrl: 'postgresql://user:pw@db.internal:5432/wagonwise',
    });
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
