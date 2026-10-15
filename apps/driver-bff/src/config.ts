import { z } from 'zod';

/** Matches core's default (config.ts) — zero-config local dev, both sides agree out of the box. */
const DEFAULT_CORE_INTERNAL_KEY = 'local-dev-internal-key';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Core is not publicly exposed (design doc §2) — the BFF reaches it over private networking,
  // here just localhost-at-a-different-port for local dev.
  CORE_INTERNAL_URL: z.url().default('http://127.0.0.1:3001'),
  // Sent as X-Internal-Key on every call to core (decision 11) — must match one of core's own
  // INTERNAL_KEYS. Same well-known local-dev default on both sides, so this needs no `.env` for
  // local dev; override with a real shared secret for anything else.
  CORE_INTERNAL_KEY: z.string().min(1).default(DEFAULT_CORE_INTERNAL_KEY),
  // What the driver app is told about new builds (GET /app/version). All optional: unset, the app says nothing.
  APP_LATEST_VERSION: z.string().trim().max(32).optional(),
  APP_MINIMUM_VERSION: z.string().trim().max(32).optional(),
  APP_UPDATE_URL: z.url().max(500).optional(),
  // Resend's signing secret for the failure webhook (POST /webhooks/resend). Unset: the route answers that it is not set up.
  RESEND_WEBHOOK_SECRET: z.string().trim().min(1).optional(),
});

export interface Config {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  readonly coreInternalUrl: string;
  readonly coreInternalKey: string;
  /** Resend's signing secret for the failure webhook; undefined means the webhook is not set up. */
  readonly resendWebhookSecret: string | undefined;
  /** The newest build, the oldest still allowed, and where to get it; each may be absent. */
  readonly appVersion: {
    readonly latestVersion?: string;
    readonly minimumVersion?: string;
    readonly updateUrl?: string;
  };
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
 * as a parameter so tests never have to mutate global state — same convention as core's own
 * config.ts, kept independently per app rather than shared, since each app's variables differ.
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
    resendWebhookSecret: values.RESEND_WEBHOOK_SECRET,
    appVersion: {
      ...(values.APP_LATEST_VERSION ? { latestVersion: values.APP_LATEST_VERSION } : {}),
      ...(values.APP_MINIMUM_VERSION ? { minimumVersion: values.APP_MINIMUM_VERSION } : {}),
      ...(values.APP_UPDATE_URL ? { updateUrl: values.APP_UPDATE_URL } : {}),
    },
  };
}
