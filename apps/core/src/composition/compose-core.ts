import type { FastifyInstance } from 'fastify';
import { Kysely, PostgresDialect } from 'kysely';
import type { Config } from '../config.js';
import { buildApp } from '../host/build-app.js';
import {
  createIdentityModule,
  type OtpSender,
  type TokenSigner,
  type UntypedDb,
} from '../modules/identity/api.js';
import { createRoutingModule, type UntypedDb as RoutingUntypedDb } from '../modules/routing/api.js';
import { createDb, createPool } from '../platform/db.js';
import { PostgresUnitOfWork } from '../platform/postgres-unit-of-work.js';
import { SystemClock } from '../platform/system-clock.js';
import { UuidIdGenerator } from '../platform/uuid-id-generator.js';
import type { Clock } from '../shared/ports/clock.js';
import type { IdGenerator } from '../shared/ports/id-generator.js';
import type { UnitOfWork } from '../shared/ports/unit-of-work.js';

/** Real adapters by default; tests substitute fakes here rather than mocking modules. */
export interface CoreOverrides {
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  readonly unitOfWork?: UnitOfWork;
  readonly db?: UntypedDb;
  readonly tokenSigner?: TokenSigner;
  readonly otpSender?: OtpSender | undefined;
}

export interface Core {
  readonly app: FastifyInstance;
  /** Closes the app and the database pool. `main.ts` calls this on SIGINT/SIGTERM. */
  close(): Promise<void>;
}

/**
 * The composition root: the one place that knows which concrete adapter satisfies which port
 * (AGENTS.md rule 5). Manual wiring, no DI container. Each bounded context adds a
 * `createXModule(deps)` call here as it lands — identity as of M1.5.
 *
 * `tokenSigner` is passed in already built rather than constructed here, because building one is
 * async (key generation/import) and this function is not — `main.ts` awaits
 * `createTokenSigner()` once at boot, `compose-core.test.ts` passes a fake.
 */
export function composeCore(
  config: Config,
  tokenSigner: TokenSigner,
  overrides: CoreOverrides = {},
): Core {
  const clock = overrides.clock ?? new SystemClock();
  const ids = overrides.ids ?? new UuidIdGenerator();
  const pool = createPool(config.databaseUrl);
  // One pool, two typed views: platform's own (empty) Database schema for the UnitOfWork, and
  // identity's untyped view for its raw-sql repositories (decision 26). Both wrap the same
  // underlying pg.Pool (cheap — Kysely instances are lightweight, the pool is what's stateful),
  // but Kysely<Database> is not assignable to Kysely<Record<string, unknown>> (its methods use
  // the schema type both co- and contravariantly), so this needs its own instance, not a cast.
  const platformDb = createDb(pool);
  const identityDb: UntypedDb =
    overrides.db ?? new Kysely<Record<string, unknown>>({ dialect: new PostgresDialect({ pool }) });
  const unitOfWork = overrides.unitOfWork ?? new PostgresUnitOfWork(platformDb);

  const identity = createIdentityModule({
    db: identityDb,
    clock,
    ids,
    unitOfWork,
    tokenSigner: overrides.tokenSigner ?? tokenSigner,
    otpSender: overrides.otpSender,
  });
  // Same underlying pool, same untyped-Kysely shape as identity's — structurally the same type
  // (Kysely<Record<string, unknown>>, no branding), so one instance serves both modules; unlike
  // platformDb vs identityDb, there's no Kysely<Database> variance problem here to work around.
  const routingDb: RoutingUntypedDb = identityDb;
  const routing = createRoutingModule({ db: routingDb, ids });

  const app = buildApp({ config, clock, ids });
  identity.registerRoutes(app);
  routing.registerRoutes(app);

  return {
    app,
    async close(): Promise<void> {
      await app.close();
      await pool.end();
    },
  };
}
