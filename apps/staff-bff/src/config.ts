import { z } from 'zod';

/** Matches core's default (config.ts) — zero-config local dev, both sides agree out of the box. */
const DEFAULT_CORE_INTERNAL_KEY = 'local-dev-internal-key';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  // 3001 is core, 3002 driver-bff.
  PORT: z.coerce.number().int().min(1).max(65535).default(3003),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Core is not publicly exposed (design doc §2); this BFF reaches it over private networking.
  CORE_INTERNAL_URL: z.url().default('http://127.0.0.1:3001'),
  // Sent as X-Internal-Key on every call to core (decision 11): must match one of core's
  // INTERNAL_KEYS. Same local-dev default on both sides, so local dev needs no `.env`.
  CORE_INTERNAL_KEY: z.string().min(1).default(DEFAULT_CORE_INTERNAL_KEY),
  // The dashboard is this BFF's only caller, from a browser, so CORS allows exactly its origin.
  // Defaults to Vite's dev-server port.
  DASHBOARD_ORIGIN: z.url().default('http://localhost:5173'),
});

export interface Config {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  readonly coreInternalUrl: string;
  readonly coreInternalKey: string;
  readonly dashboardOrigin: string;
}

/** Thrown at boot when the environment is invalid; the process should exit, not limp on. */
export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/**
 * The only place in this app that reads the process environment (AGENTS.md rule 4). Takes `env`
 * as a parameter so tests never mutate global state. Kept per app rather than shared with
 * driver-bff's, since each app's variables will drift apart.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  const values = parsed.data;
  return {
    nodeEnv: values.NODE_ENV,
    host: values.HOST,
    port: values.PORT,
    logLevel: values.LOG_LEVEL,
    coreInternalUrl: values.CORE_INTERNAL_URL,
    coreInternalKey: values.CORE_INTERNAL_KEY,
    dashboardOrigin: values.DASHBOARD_ORIGIN,
  };
}
