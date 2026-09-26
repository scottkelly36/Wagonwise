import type { FastifyInstance } from 'fastify';
import { Kysely, PostgresDialect } from 'kysely';
import type { Config } from '../config.js';
import type { AccessTokenVerifier } from '../host/access-token-verifier.js';
import { buildApp } from '../host/build-app.js';
import {
  createCongestionModule,
  type UntypedDb as CongestionUntypedDb,
} from '../modules/congestion/api.js';
import {
  createFeedbackModule,
  type UntypedDb as FeedbackUntypedDb,
} from '../modules/feedback/api.js';
import {
  createHazardsModule,
  type HazardParser,
  type UntypedDb as HazardsUntypedDb,
} from '../modules/hazards/api.js';
import {
  createIdentityModule,
  type OtpSender,
  type TokenSigner,
  type UntypedDb,
} from '../modules/identity/api.js';
import {
  createRoutingModule,
  type PushNotifier,
  type UntypedDb as RoutingUntypedDb,
} from '../modules/routing/api.js';
import { createDb, createPool } from '../platform/db.js';
import { OutboxDispatcher, type OutboxEventHandler } from '../platform/outbox-dispatcher.js';
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
  /** Defaults to a `ChannelRoutingOtpSender` splitting phone identifiers to
   *  `ClickSendOtpSender`/`ConsoleOtpSender` and email identifiers to
   *  `ResendOtpSender`/`ConsoleOtpSender` (per `config.clickSendUsername`/`clickSendApiKey`/
   *  `resendApiKey`) inside `createIdentityModule` itself — same reasoning as `pushNotifier`
   *  below: a test substitutes a fake here rather than letting a real SMS/email reach
   *  ClickSend's/Resend's actual endpoint. */
  readonly otpSender?: OtpSender | undefined;
  readonly accessTokenVerifier?: AccessTokenVerifier;
  /** Defaults to `routing.eventHandlers` (M6.4's reroute-detection handlers) — tests substitute
   *  their own list here the same way they substitute every other override, entirely replacing
   *  the real handlers rather than adding to them. */
  readonly eventHandlers?: readonly OutboxEventHandler[];
  /** Defaults to `ExpoPushNotifier` (M6.5) inside `createRoutingModule` itself — same reasoning
   *  as `otpSender` above: a test substitutes a fake here rather than letting a real push reach
   *  Expo's actual endpoint (M6.7's end-to-end reroute test). */
  readonly pushNotifier?: PushNotifier | undefined;
  /** Defaults to `AnthropicHazardParser`/`NullHazardParser` (per `config.anthropicApiKey`) inside
   *  `createHazardsModule` itself — same reasoning as `pushNotifier` above: a test substitutes a
   *  fake here rather than letting a real call reach Anthropic's actual endpoint (M7.1). */
  readonly hazardParser?: HazardParser | undefined;
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
 * `tokenSigner` and `accessTokenVerifier` are passed in already built rather than constructed
 * here, because building either is async (key generation/import, or `importJWK`) and this
 * function is not — `main.ts` awaits both once at boot, `compose-core.test.ts` passes fakes.
 */
export function composeCore(
  config: Config,
  tokenSigner: TokenSigner,
  accessTokenVerifier: AccessTokenVerifier,
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
    clickSendUsername: config.clickSendUsername,
    clickSendApiKey: config.clickSendApiKey,
    resendApiKey: config.resendApiKey,
    resendFromEmail: config.resendFromEmail,
    otpSender: overrides.otpSender,
  });
  // Same underlying pool, same untyped-Kysely shape as identity's — structurally the same type
  // (Kysely<Record<string, unknown>>, no branding), so one instance serves both modules; unlike
  // platformDb vs identityDb, there's no Kysely<Database> variance problem here to work around.
  const routingDb: RoutingUntypedDb = identityDb;
  const hazardsDb: HazardsUntypedDb = identityDb;
  const feedbackDb: FeedbackUntypedDb = identityDb;
  const congestionDb: CongestionUntypedDb = identityDb;

  // hazards and identity both built before routing: routing's HazardAvoidanceQueryAdapter (M3.5)
  // and its reroute-detection handlers (M6.4) both wrap the other modules' facades — the same
  // "one module's composition needing another module's instance" case.
  const hazards = createHazardsModule({
    db: hazardsDb,
    clock,
    ids,
    anthropicApiKey: config.anthropicApiKey,
    hazardParser: overrides.hazardParser,
    identity,
  });
  const routing = createRoutingModule({
    db: routingDb,
    ids,
    clock,
    valhallaUrl: config.valhallaUrl,
    expoAccessToken: config.expoAccessToken,
    hazards,
    identity,
    pushNotifier: overrides.pushNotifier,
  });
  const feedback = createFeedbackModule({ db: feedbackDb, clock, ids });
  const congestion = createCongestionModule({ db: congestionDb, clock });

  const outboxDispatcher = new OutboxDispatcher(
    platformDb,
    overrides.eventHandlers ?? routing.eventHandlers,
    clock,
  );
  outboxDispatcher.start(config.outboxPollIntervalMs);

  const app = buildApp({
    config,
    clock,
    ids,
    accessTokenVerifier: overrides.accessTokenVerifier ?? accessTokenVerifier,
  });
  identity.registerRoutes(app);
  routing.registerRoutes(app);
  hazards.registerRoutes(app);
  feedback.registerRoutes(app);
  congestion.registerRoutes(app);

  return {
    app,
    async close(): Promise<void> {
      await outboxDispatcher.stop();
      await app.close();
      await pool.end();
    },
  };
}
