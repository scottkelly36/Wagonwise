import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { Result } from '../../shared/result.js';
import type { ClosureRepository } from './application/closure-repository.js';
import type { ClosureSource } from './application/closure-source.js';
import {
  refreshClosures,
  type RefreshError,
  type RefreshSummary,
} from './application/refresh-closures.js';
import type { UntypedDb } from './infrastructure/db.js';
import {
  NationalHighwaysClient,
  NoClosureSource,
  type NationalHighwaysSettings,
} from './infrastructure/national-highways-client.js';
import { PostgresClosureRepository } from './infrastructure/postgres-closure-repository.js';
import { registerClosureRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';
export type { RefreshError, RefreshSummary } from './application/refresh-closures.js';
export type {
  Closure,
  ClosureKind,
  ClosurePoint,
  ClosureSourceUnavailable,
  ClosureStatus,
  SnapshotEmpty,
} from './domain/closure.js';
export type { NationalHighwaysSettings } from './infrastructure/national-highways-client.js';

export interface ClosuresModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  /** National Highways' keys and address. Unset means no fetching (and no requests), so a dev machine with none still boots. */
  readonly settings?: NationalHighwaysSettings | undefined;
  /** Replaces the service; tests pass a fake. */
  readonly source?: ClosureSource | undefined;
  /** Replaces the database copy; tests pass a fake. */
  readonly repository?: ClosureRepository | undefined;
  /** Told about a fetch that failed for a reason that is ours to fix (a refused key, an outage, a changed format). */
  readonly onProblem?: ((what: string, detail: unknown) => void) | undefined;
}

export interface ClosuresModule {
  /** Whether an API key is set. Without one `refresh` does nothing useful and no request is made. */
  readonly enabled: boolean;
  /**
   * Fetches the feed afresh (one request of about 10 MB, so a job and never a request from a driver) and makes the stored copy match
   * it. A failed fetch, or an empty answer when plenty is stored, leaves the last good copy in place and comes back as an error value.
   */
  refresh(): Promise<Result<RefreshSummary, RefreshError>>;
  /** `POST /closures/nearby` and `POST /closures/along-route`: the closures near a point, and along a planned route, from the stored copy. */
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `closures`' only public surface (AGENTS.md rule 6): road and lane closures on the strategic road network from National Highways'
 * Transport Data Feeds, kept as our own copy.
 */
export function createClosuresModule(deps: ClosuresModuleDeps): ClosuresModule {
  const source: ClosureSource =
    deps.source ??
    (deps.settings === undefined
      ? new NoClosureSource()
      : new NationalHighwaysClient(deps.settings, undefined, deps.onProblem));
  const repo = deps.repository ?? new PostgresClosureRepository(deps.db);
  return {
    enabled: source.enabled,
    refresh: () => refreshClosures({ source, repo, clock: deps.clock }),
    registerRoutes(app) {
      registerClosureRoutes(app, { repo, clock: deps.clock });
    },
  };
}
