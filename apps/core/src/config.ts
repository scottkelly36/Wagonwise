import { createPrivateKey } from 'node:crypto';
import { z } from 'zod';

/** The working name is not final — this is the one place it lives (AGENTS.md). */
export const PRODUCT_NAME = 'WagonWise';

// Matches infra/docker/compose.yml's postgres service (user/password/db all "wagonwise"), so
// `pnpm db:up && pnpm db:migrate` works with zero configuration — the README's cold-start
// promise. Override in `.env` for anything else (a remote database, different local creds).
const DEFAULT_DATABASE_URL = 'postgres://wagonwise:wagonwise@127.0.0.1:5432/wagonwise';

// A well-known, obviously-not-secret default so `pnpm dev` plus a plain curl still works with
// zero configuration (the cold-start promise) — override for anything that isn't this machine.
const DEFAULT_INTERNAL_KEYS = 'local-dev-internal-key';

function isEd25519Pkcs8Pem(pem: string): boolean {
  try {
    return createPrivateKey(pem).asymmetricKeyType === 'ed25519';
  } catch {
    return false;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).default(DEFAULT_DATABASE_URL),
  // Optional: unset means identity signs with a fresh key generated at boot, which is fine for
  // local dev (every restart just invalidates existing sessions) but never for anything meant to
  // stay up — set this to a PEM-encoded Ed25519 private key (PKCS8) before a real deployment.
  // A real PEM spans multiple lines; env files and most secret stores don't, so a literal `\n`
  // (backslash-n, not a real newline — Node's --env-file leaves it exactly as written) is the
  // usual way to carry one in a single value. Normalised back to real newlines before validating,
  // so both forms work: paste it with actual line breaks, or escape them, either is fine.
  IDENTITY_PRIVATE_KEY: z
    .string()
    .min(1)
    .optional()
    .transform((pem) => pem?.replaceAll('\\n', '\n'))
    .refine((pem) => pem === undefined || isEd25519Pkcs8Pem(pem), {
      message: 'must be a PEM-encoded Ed25519 private key (PKCS8)',
    }),
  // Every request except /health must present one of these in X-Internal-Key (decision 11) —
  // core is not publicly exposed, so this is the second line of defence, not the only one.
  // Comma-separated so two keys can be valid at once, for rotation without downtime: deploy the
  // new key here first, update the BFF to send it, then remove the old one from this list.
  INTERNAL_KEYS: z
    .string()
    .min(1)
    .default(DEFAULT_INTERNAL_KEYS)
    .transform((raw) =>
      raw
        .split(',')
        .map((key) => key.trim())
        .filter((key) => key.length > 0),
    )
    .refine((keys) => keys.length > 0, {
      message: 'must contain at least one non-empty, comma-separated key',
    }),
});

export interface Config {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  readonly databaseUrl: string;
  readonly identityPrivateKeyPem: string | undefined;
  readonly internalKeys: readonly string[];
}

/** Thrown at boot when the environment is invalid; the process should exit, not limp on. */
export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/**
 * The only place in the codebase that reads the process environment (AGENTS.md rule 4).
 * Everything else receives a `Config` as an argument. Takes `env` as a parameter so tests
 * never have to mutate global state.
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
    databaseUrl: values.DATABASE_URL,
    identityPrivateKeyPem: values.IDENTITY_PRIVATE_KEY,
    internalKeys: values.INTERNAL_KEYS,
  };
}
