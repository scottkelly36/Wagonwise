// `pnpm staff:bootstrap --email you@example.com --name "Your Name" [--dashboard-url https://…]`
//
// Creates the invite for the first WagonWise admin (P2-M1.12b) and prints its link. Run once, on
// the server (DigitalOcean: the `core` component's Console tab), after the migrations. Refused as
// soon as any WagonWise admin exists: invite everyone else from the dashboard's Users screen.
import { parseArgs } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { ConfigError, loadConfig } from '../src/config.js';
import { bootstrapFirstAdmin } from '../src/modules/companies/api.js';
import { createPool } from '../src/platform/db.js';
import { PostgresDataScopes } from '../src/platform/postgres-data-scopes.js';
import { SystemClock } from '../src/platform/system-clock.js';
import { UuidIdGenerator } from '../src/platform/uuid-id-generator.js';

const USAGE =
  'usage: pnpm staff:bootstrap --email you@example.com --name "Your Name" [--dashboard-url https://dashboard.example]';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let args;
try {
  args = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      'dashboard-url': { type: 'string' },
    },
  }).values;
} catch (error) {
  fail(`${error instanceof Error ? error.message : String(error)}\n${USAGE}`);
}
const email = args.email?.trim() ?? '';
const name = args.name?.trim() ?? '';
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || name === '') fail(USAGE);

let config;
try {
  config = loadConfig();
} catch (error) {
  if (error instanceof ConfigError) fail(error.message);
  throw error;
}

// The owner connection, like `db:migrate`: this runs once, by hand, on the server.
const pool = createPool(config.databaseUrl);
const scopes = new PostgresDataScopes(pool);
const db = new Kysely<Record<string, unknown>>({
  dialect: new PostgresDialect({ pool: scopes.pool }),
});

try {
  const result = await bootstrapFirstAdmin(
    { db, clock: new SystemClock(), ids: new UuidIdGenerator(), dataScopes: scopes },
    { email, name },
  );
  if (!result.ok) {
    fail(
      result.reason === 'AdminAlreadyExists'
        ? 'staff:bootstrap: a WagonWise admin already exists. Invite people from the dashboard (Users).'
        : `staff:bootstrap: ${email} already has a staff account.`,
    );
  }
  const base = args['dashboard-url']?.replace(/\/+$/, '') ?? '<your dashboard address>';
  console.log(
    `Invite created for ${name} <${email}>, valid until ${result.expiresAt.toISOString()}.`,
  );
  console.log('Open this link to choose a password and a second factor (it works once):');
  console.log(`  ${base}/join?token=${encodeURIComponent(result.token)}`);
} finally {
  await db.destroy();
}
