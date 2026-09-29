import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

describe('loadConfig', () => {
  it('needs nothing set: every variable has a safe local default', () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: 'development',
      host: '127.0.0.1',
      port: 3003,
      logLevel: 'info',
      coreInternalUrl: 'http://127.0.0.1:3001',
      coreInternalKey: 'local-dev-internal-key',
      dashboardOrigin: 'http://localhost:5173',
    });
  });

  it('reads overrides', () => {
    expect(
      loadConfig({
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '4003',
        LOG_LEVEL: 'warn',
        CORE_INTERNAL_URL: 'https://core.internal',
        CORE_INTERNAL_KEY: 'a-real-shared-secret',
        DASHBOARD_ORIGIN: 'https://dashboard.wagon-wise.co.uk',
      }),
    ).toEqual({
      nodeEnv: 'production',
      host: '0.0.0.0',
      port: 4003,
      logLevel: 'warn',
      coreInternalUrl: 'https://core.internal',
      coreInternalKey: 'a-real-shared-secret',
      dashboardOrigin: 'https://dashboard.wagon-wise.co.uk',
    });
  });

  it('rejects a bad value, naming it', () => {
    expect(() => loadConfig({ PORT: 'not-a-port' })).toThrow(ConfigError);
    expect(() => loadConfig({ DASHBOARD_ORIGIN: 'not a url' })).toThrow(/DASHBOARD_ORIGIN/);
  });
});
