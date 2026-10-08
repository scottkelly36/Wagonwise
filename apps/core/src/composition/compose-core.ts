import { makeId } from '../shared/brand.js';
import { err, ok } from '../shared/result.js';
import type { FastifyInstance } from 'fastify';
import { Kysely, PostgresDialect } from 'kysely';
import type { Config } from '../config.js';
import { createChecksModule, type UntypedDb as ChecksUntypedDb } from '../modules/checks/api.js';
import {
  createLocalStaffAccessTokenVerifier,
  type AccessTokenVerifier,
  type StaffAccessTokenVerifier,
} from '../host/access-token-verifier.js';
import { buildApp } from '../host/build-app.js';
import {
  createCompaniesModule,
  type CompaniesModule,
  type UntypedDb as CompaniesUntypedDb,
} from '../modules/companies/api.js';
import {
  createCongestionModule,
  type UntypedDb as CongestionUntypedDb,
} from '../modules/congestion/api.js';
import {
  createFeedbackModule,
  type UntypedDb as FeedbackUntypedDb,
} from '../modules/feedback/api.js';
import { createFleetModule, type UntypedDb as FleetUntypedDb } from '../modules/fleet/api.js';
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
import { createJobsModule, type UntypedDb as JobsUntypedDb } from '../modules/jobs/api.js';
import { createParkingModule, type UntypedDb as ParkingUntypedDb } from '../modules/parking/api.js';
import { createWeatherModule } from '../modules/weather/api.js';
import { createBillingModule, type UntypedDb as BillingUntypedDb } from '../modules/billing/api.js';
import { createPlacesModule, type UntypedDb as PlacesUntypedDb } from '../modules/places/api.js';
import {
  createRoutingModule,
  type PushNotifier,
  type UntypedDb as RoutingUntypedDb,
} from '../modules/routing/api.js';
import { createDb, createPool } from '../platform/db.js';
import { deterministicUuid } from '../platform/deterministic-id.js';
import { OutboxDispatcher, type OutboxEventHandler } from '../platform/outbox-dispatcher.js';
import { PeriodicTasks } from '../platform/periodic-task.js';
import { PostgresDataScopes } from '../platform/postgres-data-scopes.js';
import { PostgresUnitOfWork } from '../platform/postgres-unit-of-work.js';
import { SystemClock } from '../platform/system-clock.js';
import { UuidIdGenerator } from '../platform/uuid-id-generator.js';
import type { Clock } from '../shared/ports/clock.js';
import type { DataScopes } from '../shared/ports/data-scope.js';
import type { IdGenerator } from '../shared/ports/id-generator.js';
import type { UnitOfWork } from '../shared/ports/unit-of-work.js';

/** Real adapters by default; tests substitute fakes here rather than mocking modules. */
export interface CoreOverrides {
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  readonly unitOfWork?: UnitOfWork;
  readonly dataScopes?: DataScopes;
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
  readonly staffAccessTokenVerifier?: StaffAccessTokenVerifier;
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

/** Staff tokens are verified with the same public key identity signs with. Building a verifier
 *  is async (`importJWK`) and `composeCore` isn't, so it's built on first use. */
function lazyStaffVerifier(tokenSigner: TokenSigner): StaffAccessTokenVerifier {
  let verifier: Promise<StaffAccessTokenVerifier> | undefined;
  return {
    async verify(token) {
      verifier ??= tokenSigner.publicJwk().then(createLocalStaffAccessTokenVerifier);
      return (await verifier).verify(token);
    },
  };
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
  // Requests are served as `wagonwise_app` when APP_DATABASE_URL is set (P2-M1.7), so RLS
  // applies; migrations run separately (`scripts/migrate.ts`) on DATABASE_URL, the owner.
  const pool = createPool(config.appDatabaseUrl ?? config.databaseUrl);
  // Every Kysely instance below is built on `postgresScopes.pool`, not `pool` directly, so a
  // query made inside `dataScopes.run` joins that scope's transaction (and its RLS settings).
  const postgresScopes = new PostgresDataScopes(pool);
  const dataScopes = overrides.dataScopes ?? postgresScopes;
  // One pool, two typed views: platform's own (empty) Database schema for the UnitOfWork, and
  // identity's untyped view for its raw-sql repositories (decision 26). Both wrap the same
  // underlying pg.Pool (cheap — Kysely instances are lightweight, the pool is what's stateful),
  // but Kysely<Database> is not assignable to Kysely<Record<string, unknown>> (its methods use
  // the schema type both co- and contravariantly), so this needs its own instance, not a cast.
  const platformDb = createDb(postgresScopes.pool);
  const identityDb: UntypedDb =
    overrides.db ??
    new Kysely<Record<string, unknown>>({
      dialect: new PostgresDialect({ pool: postgresScopes.pool }),
    });
  const unitOfWork = overrides.unitOfWork ?? new PostgresUnitOfWork(platformDb);

  // Staff accounts live in `companies`, which is built after identity and hazards (it needs
  // identity's code sender and token signer). Their staff-only admin screens (P2-M1.12c) ask
  // "who is this staff member?" per request, long after composition, so they get a function that
  // reaches `companies` once it exists, rather than a construction-order cycle.
  const composed: { companies?: CompaniesModule } = {};
  const staffCaller = (staffId: string) => {
    if (composed.companies === undefined) throw new Error('companies module not composed yet');
    return composed.companies.getStaffCaller(staffId);
  };
  const isPlatformStaff = async (staffId: string) =>
    (await staffCaller(staffId))?.kind === 'platform';

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
    platformStaff: { isPlatformStaff },
    // Called when a driver deletes their account, long after every module below is built. Each
    // part is safe to run twice, and the account is only scrubbed once all of them have succeeded.
    driverDataEraser: {
      erase: async ({ driverId, identifier }) => {
        await routing.eraseDriverData(driverId);
        await feedback.eraseDriverData(driverId);
        await fleet.eraseDriverData(driverId, identifier);
        await places.eraseDriverData(driverId);
      },
    },
  });
  // Same underlying pool, same untyped-Kysely shape as identity's — structurally the same type
  // (Kysely<Record<string, unknown>>, no branding), so one instance serves both modules; unlike
  // platformDb vs identityDb, there's no Kysely<Database> variance problem here to work around.
  const routingDb: RoutingUntypedDb = identityDb;
  const hazardsDb: HazardsUntypedDb = identityDb;
  const feedbackDb: FeedbackUntypedDb = identityDb;
  const congestionDb: CongestionUntypedDb = identityDb;
  const companiesDb: CompaniesUntypedDb = identityDb;
  const parkingDb: ParkingUntypedDb = identityDb;
  const placesDb: PlacesUntypedDb = identityDb;
  const billingDb: BillingUntypedDb = identityDb;
  const checksDb: ChecksUntypedDb = identityDb;
  const fleetDb: FleetUntypedDb = identityDb;
  const jobsDb: JobsUntypedDb = identityDb;

  // hazards and identity both built before routing: routing's HazardAvoidanceQueryAdapter (M3.5)
  // and its reroute-detection handlers (M6.4) both wrap the other modules' facades — the same
  // "one module's composition needing another module's instance" case.
  const hazards = createHazardsModule({
    db: hazardsDb,
    clock,
    ids,
    anthropicApiKey: config.anthropicApiKey,
    hazardParser: overrides.hazardParser,
    admins: { isAdmin: isPlatformStaff },
  });
  const routing = createRoutingModule({
    db: routingDb,
    ids,
    clock,
    valhallaUrl: config.valhallaUrl,
    fuelPricePerLitreGBP: config.fuelPricePerLitreGBP,
    expoAccessToken: config.expoAccessToken,
    hazards,
    identity,
    pushNotifier: overrides.pushNotifier,
  });
  const feedback = createFeedbackModule({ db: feedbackDb, clock, ids });
  const congestion = createCongestionModule({ db: congestionDb, clock });
  const companies = createCompaniesModule({
    db: companiesDb,
    clock,
    ids,
    identity,
    dataScopes,
    staffSecretKey: config.staffSecretKey,
    dashboardUrl: config.dashboardUrl,
  });
  composed.companies = companies;
  const parking = createParkingModule({ db: parkingDb, clock });
  const billing = createBillingModule({
    db: billingDb,
    clock,
    ids,
    dataScopes,
    callers: { getCaller: staffCaller },
    companies: {
      list: async () =>
        (await companies.listCompanyNames()).map((c) => ({
          id: makeId<'CompanyId'>(c.id),
          name: c.name,
        })),
    },
    // fleet is built just below and needs billing for its capacity check, so this is read only when called.
    vehicles: { countFor: (companyId) => fleet.countVehicles(companyId) },
  });
  const fleet = createFleetModule({
    db: fleetDb,
    ids,
    dataScopes,
    callers: { getCaller: staffCaller },
    clock,
    driverIdentities: { getIdentifier: (driverId) => identity.getDriverIdentifier(driverId) },
    companyNames: { namesFor: (ids) => companies.getCompanyNames(ids) },
    vehicleCapacity: { capacityFor: (companyId) => billing.vehicleCapacityFor(companyId) },
  });
  const places = createPlacesModule({
    db: placesDb,
    clock,
    dataScopes,
    // A driver's company is whichever they have an active link with, as for jobs.
    membership: {
      isActiveDriverOfCompany: (driverId, companyId) =>
        fleet.isActiveDriverOfCompany(driverId, companyId),
    },
    callers: { getCaller: staffCaller },
    driverIdentities: { getIdentifier: (driverId) => identity.getDriverIdentifier(driverId) },
  });
  const checks = createChecksModule({
    db: checksDb,
    ids,
    clock,
    dataScopes,
    callers: { getCaller: staffCaller },
    vehicles: {
      belongsToCompany: async (vehicleId, companyId) =>
        (await fleet.getVehicleCompanyId(vehicleId)) === companyId,
    },
  });
  const weather = createWeatherModule({ clock, metOfficeApiKey: config.metOfficeApiKey });
  const jobs = createJobsModule({
    db: jobsDb,
    ids,
    clock,
    dataScopes,
    callers: { getCaller: staffCaller },
    drivers: {
      belongsToCompany: (driverId, companyId) => fleet.isActiveDriverOfCompany(driverId, companyId),
    },
    vehicles: {
      belongsToCompany: async (vehicleId, companyId) =>
        (await fleet.getVehicleCompanyId(vehicleId)) === companyId,
    },
    driverIdentities: { getIdentifier: (driverId) => identity.getDriverIdentifier(driverId) },
    vehicleNames: {
      getName: async (vehicleId) => (await fleet.getVehicle(vehicleId))?.name ?? null,
    },
    // A job is routed for the company vehicle it is assigned to (fleet's dimensions), not a
    // driver's own profile; composition is where those two modules meet (AGENTS.md rule 7).
    navigationProfiles: {
      // The same company vehicle always lands on the same profile for a given driver, so starting a
      // job twice refreshes one profile rather than piling up copies.
      provision: async ({ driverId, vehicleId }) => {
        const vehicle = await fleet.getVehicle(vehicleId);
        if (vehicle === null) return err({ tag: 'VehicleUnavailable' });
        const saved = await routing.upsertVehicleProfile({
          id: deterministicUuid('company-vehicle-profile', driverId, vehicleId),
          driverId,
          name: `Company: ${vehicle.name}`,
          dimensions: vehicle.dimensions,
        });
        return saved.ok
          ? ok({ profileId: saved.value.id, vehicleName: vehicle.name })
          : err({ tag: 'VehicleUnavailable' });
      },
    },
    routes: {
      estimate: async ({ vehicleId, from, to }) => {
        const dimensions = await fleet.getVehicleDimensions(vehicleId);
        if (dimensions === null) return err({ tag: 'RouteUnavailable' });
        const route = await routing.estimateRoute({ origin: from, destination: to, dimensions });
        return route.ok
          ? ok({
              distanceKm: route.value.distanceKm,
              durationMin: route.value.durationMin,
              geometry: route.value.geometry,
            })
          : err({ tag: 'RouteUnavailable' });
      },
    },
  });

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
    staffAccessTokenVerifier:
      overrides.staffAccessTokenVerifier ?? lazyStaffVerifier(overrides.tokenSigner ?? tokenSigner),
  });
  // Housekeeping on timers, started once the app (and its logger) exists. Both passes are safe to
  // run twice, so a second core instance would do no harm.
  const periodicTasks = new PeriodicTasks(app.log);
  const weatherTask = {
    name: 'fetch-weather-warnings',
    intervalMs: config.weatherPollIntervalMs,
    run: () => weather.refresh(),
  };
  periodicTasks.start({
    name: 'expire-hazards',
    intervalMs: config.hazardExpiryIntervalMs,
    run: async () => {
      const expired = await hazards.expireDueHazards();
      if (expired > 0) app.log.info({ expired }, 'expired hazards');
    },
  });
  if (weather.enabled) {
    // First fetch now, so warnings are there soon after a restart rather than after one interval.
    void periodicTasks.runOnce(weatherTask);
    periodicTasks.start(weatherTask);
  }
  periodicTasks.start({
    name: 'prune-job-positions',
    intervalMs: config.positionSweepIntervalMs,
    run: async () => {
      const removed = await jobs.pruneOldPositions(config.jobPositionRetentionDays);
      if (removed > 0) app.log.info({ removed }, 'deleted old job positions');
    },
  });

  periodicTasks.start({
    name: 'prune-proof-photos',
    intervalMs: config.positionSweepIntervalMs,
    run: async () => {
      // Each company chooses how long its delivery photos are kept; the photo goes, the job record stays.
      const removed = await jobs.pruneProofPhotos(await companies.listPhotoRetention());
      if (removed > 0) app.log.info({ removed }, 'deleted old proof-of-delivery photos');
    },
  });

  periodicTasks.start({
    name: 'prune-route-plans',
    intervalMs: config.positionSweepIntervalMs,
    run: async () => {
      const removed = await routing.pruneOldRoutePlans(config.routeRetentionDays);
      if (removed > 0) app.log.info({ removed }, 'deleted old route plans');
    },
  });

  identity.registerRoutes(app);
  routing.registerRoutes(app);
  hazards.registerRoutes(app);
  feedback.registerRoutes(app);
  congestion.registerRoutes(app);
  companies.registerRoutes(app);
  parking.registerRoutes(app);
  fleet.registerRoutes(app);
  jobs.registerRoutes(app);
  places.registerRoutes(app);
  billing.registerRoutes(app);
  checks.registerRoutes(app);
  weather.registerRoutes(app);

  return {
    app,
    async close(): Promise<void> {
      await periodicTasks.stop();
      await outboxDispatcher.stop();
      await app.close();
      await pool.end();
    },
  };
}
