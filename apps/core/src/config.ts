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

// Matches infra/docker/compose.yml's valhalla service's published port (8002) — zero
// configuration needed once `docker compose --profile valhalla up` is running (M2.1).
const DEFAULT_VALHALLA_URL = 'http://127.0.0.1:8002';

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
  VALHALLA_URL: z.url().default(DEFAULT_VALHALLA_URL),
  // Optional: Expo's push API works without one (M6.5) — only needed if a project ever turns on
  // Expo's "enhanced push security" setting, which then requires every request to carry it.
  EXPO_ACCESS_TOKEN: z.string().min(1).optional(),
  // Optional: unlike EXPO_ACCESS_TOKEN, Anthropic's API genuinely requires a key — unset means
  // voice reports fall back to NullHazardParser (M7.1: every transcript lands as `type: 'other'`
  // with itself as the note) rather than the process failing to boot, keeping the cold-start
  // promise for a dev machine with no key yet.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // Optional pair: unset means OTP codes fall back to ConsoleOtpSender (logs the code, never
  // sends it) — fine for local dev, useless for a driver who isn't watching this process's
  // stdout. Both set wires ClickSendOtpSender instead. ClickSend's own auth uses the account
  // email as the "username" half of HTTP Basic auth, not a separate username field.
  CLICKSEND_USERNAME: z.string().min(1).optional(),
  CLICKSEND_API_KEY: z.string().min(1).optional(),
  // Optional: unset means the email half of OTP delivery also falls back to ConsoleOtpSender.
  // Set means ResendOtpSender handles email identifiers (ClickSend still handles phone ones —
  // ChannelRoutingOtpSender in identity/api.ts picks between them per identifier).
  RESEND_API_KEY: z.string().min(1).optional(),
  // Optional: Resend's own sandbox sender (works with zero setup, but only delivers to the
  // account owner's own address) is the default in resend-otp-sender.ts — only needed here to
  // override once a real sending domain is verified with Resend.
  RESEND_FROM_EMAIL: z.string().min(1).optional(),
  // How often the in-process outbox poller checks for pending events (decision 5, M1). 2s is
  // fast enough that a Phase 1 tester never notices the delay, without hammering the database
  // between polls.
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(2000),
  // M9's rough fuel-cost estimate (docs/progress.md) — one app-wide constant, not a live price
  // feed. Default is a rough UK average diesel price; update it here as prices actually move,
  // rather than wiring up a live feed for a number that's explicitly a rough estimate anyway.
  FUEL_PRICE_PER_LITRE_GBP: z.coerce.number().positive().default(1.6),
});

export interface Config {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly host: string;
  readonly port: number;
  readonly logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  readonly databaseUrl: string;
  readonly identityPrivateKeyPem: string | undefined;
  readonly internalKeys: readonly string[];
  readonly valhallaUrl: string;
  readonly expoAccessToken: string | undefined;
  readonly anthropicApiKey: string | undefined;
  readonly clickSendUsername: string | undefined;
  readonly clickSendApiKey: string | undefined;
  readonly resendApiKey: string | undefined;
  readonly resendFromEmail: string | undefined;
  readonly outboxPollIntervalMs: number;
  readonly fuelPricePerLitreGBP: number;
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
    valhallaUrl: values.VALHALLA_URL,
    expoAccessToken: values.EXPO_ACCESS_TOKEN,
    anthropicApiKey: values.ANTHROPIC_API_KEY,
    clickSendUsername: values.CLICKSEND_USERNAME,
    clickSendApiKey: values.CLICKSEND_API_KEY,
    resendApiKey: values.RESEND_API_KEY,
    resendFromEmail: values.RESEND_FROM_EMAIL,
    outboxPollIntervalMs: values.OUTBOX_POLL_INTERVAL_MS,
    fuelPricePerLitreGBP: values.FUEL_PRICE_PER_LITRE_GBP,
  };
}
