import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

describe('loadConfig', () => {
  it('needs nothing set: every variable has a safe local default', () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 3002,
      logLevel: 'info',
      coreInternalUrl: 'http://127.0.0.1:3001',
      coreInternalKey: 'local-dev-internal-key',
      dashboardOrigin: 'http://localhost:5173',
    });
  });

  it("defaults CORE_INTERNAL_KEY to match core's own default, so local dev needs no .env", () => {
    expect(loadConfig({}).coreInternalKey).toBe('local-dev-internal-key');
  });

  it('reads overrides', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: '4002',
      LOG_LEVEL: 'warn',
      CORE_INTERNAL_URL: 'https://core.internal',
      CORE_INTERNAL_KEY: 'a-real-shared-secret',
      DASHBOARD_ORIGIN: 'https://dashboard.wagon-wise.co.uk',
    });
    expect(config).toEqual({
      nodeEnv: 'production',
      host: '0.0.0.0',
      port: 4002,
      logLevel: 'warn',
      coreInternalUrl: 'https://core.internal',
      coreInternalKey: 'a-real-shared-secret',
      dashboardOrigin: 'https://dashboard.wagon-wise.co.uk',
    });
  });

  it.each([
    ['not a number', 'abc'],
    ['out of range', '70000'],
  ])('rejects a PORT that is %s', (_label, port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(ConfigError);
  });

  it('rejects a CORE_INTERNAL_URL that is not a URL', () => {
    expect(() => loadConfig({ CORE_INTERNAL_URL: 'not-a-url' })).toThrow(ConfigError);
  });

  it('rejects an empty CORE_INTERNAL_KEY', () => {
    expect(() => loadConfig({ CORE_INTERNAL_KEY: '' })).toThrow(ConfigError);
  });

  it('rejects a DASHBOARD_ORIGIN that is not a URL', () => {
    expect(() => loadConfig({ DASHBOARD_ORIGIN: 'not-a-url' })).toThrow(ConfigError);
  });

  it('ignores unrelated environment variables', () => {
    expect(() => loadConfig({ PATH: '/usr/bin' })).not.toThrow();
  });
});
