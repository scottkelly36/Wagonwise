import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { HazardParser } from './application/ports/hazard-parser.js';
import { isExpired, type GeoPoint, type HazardType } from './domain/hazard-report.js';
import { AnthropicHazardParser } from './infrastructure/anthropic-hazard-parser.js';
import type { UntypedDb } from './infrastructure/db.js';
import { NullHazardParser } from './infrastructure/null-hazard-parser.js';
import { PostgresHazardRepository } from './infrastructure/postgres-hazard-repository.js';
import { registerHazardsRoutes, type HazardsRouteDeps } from './interface/routes.js';

// Re-exported so composition/ can type its overrides without reaching past this facade into
// application/ or infrastructure/ directly (modules-reachable-only-through-api, decision 29).
export type { UntypedDb } from './infrastructure/db.js';
export type { HazardParser, ParsedVoiceReport } from './application/ports/hazard-parser.js';

export interface HazardsModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  /** Only for outbox event ids (M6.3) — decision 62's "no IdGenerator, every use case takes a
   *  caller-supplied id" was about the aggregate itself, not an event raised alongside it. */
  readonly ids: IdGenerator;
  /** Optional — unlike `expoAccessToken`, Anthropic's API genuinely requires a key. Unset wires
   *  `NullHazardParser` instead of `AnthropicHazardParser` (M7.1), so `pnpm dev` keeps working
   *  with zero configuration; every voice transcript just lands as `type: 'other'` until a key is
   *  added. */
  readonly anthropicApiKey?: string | undefined;
  /** Defaults to `AnthropicHazardParser`/`NullHazardParser` per `anthropicApiKey` above — same
   *  "module wires its own adapter, override for tests" precedent as `pushNotifier`
   *  (`routing/api.ts`). Override (e.g. with a stub) for tests or a local run that shouldn't
   *  reach Anthropic's real endpoint. */
  readonly hazardParser?: HazardParser | undefined;
}

/** Only the four hazard types design doc §5 names as blocking map to an avoidance kind; the rest
 *  are advisory and never returned by `findAvoidanceCandidates`. A `Record` over every `HazardType`
 *  so a ninth type added later fails to compile here until someone decides which bucket it's in,
 *  rather than silently defaulting to "not blocking" — mirrors `isBlocking()`'s own classification
 *  (domain/hazard-report.ts), duplicated here because this is the one place routing is allowed to
 *  see a translated *result* of it, never the classification itself (AGENTS.md rule 7: routing
 *  never imports HazardType). */
const AVOIDANCE_KIND: Record<
  HazardType,
  'height' | 'width' | 'weight' | 'prohibition' | undefined
> = {
  low_bridge: 'height',
  weight_limit: 'weight',
  width_restriction: 'width',
  no_hgv: 'prohibition',
  tight_bend: undefined,
  roadworks: undefined,
  flooding: undefined,
  other: undefined,
};

/**
 * What `findAvoidanceCandidates` returns — hazards' own read-model DTO for the one cross-context
 * read routing needs (design doc §3: "routing needs active hazards to build avoid polygons").
 * Deliberately not `HazardReport`/`HazardType`: routing's adapter (`routing/infrastructure/
 * hazard-avoidance-query.ts`) reads this shape and never imports anything from `hazards/domain/`
 * (AGENTS.md rule 7). `kind` already uses routing's own vocabulary (its four values are exactly
 * `ObstructionKind`, routing/domain/reported-obstruction.ts) purely by structural coincidence, not
 * an import in either direction.
 */
export interface AvoidanceCandidate {
  readonly id: string;
  readonly kind: 'height' | 'width' | 'weight' | 'prohibition';
  readonly limit?: number;
  readonly location: GeoPoint;
}

export interface HazardsModule {
  registerRoutes(app: FastifyInstance): void;
  /** Active, non-expired, blocking-type hazards within `radiusM` of a corridor — the on-route
   *  detection query (design doc §5) as consumed by routing's `HazardAvoidanceQuery` adapter.
   *  Filters out advisory types and anything not genuinely active *right now* (`isExpired()`,
   *  not just `status`) — a temporary hazard whose 7 days passed but `expireHazards` (M3.2)
   *  hasn't run yet must not still be routed around (docs/progress.md, M3.4 deviations). */
  findAvoidanceCandidates(
    corridor: readonly GeoPoint[],
    radiusM: number,
  ): Promise<AvoidanceCandidate[]>;
}

/**
 * `hazards`'s only public surface (AGENTS.md rule 6). Everything under `domain/`, `application/`,
 * `infrastructure/` and `interface/` is reachable only through here — same pattern as
 * identity/api.ts and routing/api.ts. Every hazard *report* still takes a caller-supplied id
 * (decision 62) — `IdGenerator` (M6.3) is only ever used for an outbox event's own id, a
 * different and narrower need decision 62 was never about.
 */
export function createHazardsModule(deps: HazardsModuleDeps): HazardsModule {
  const repo = new PostgresHazardRepository(deps.db);
  const hazardParser =
    deps.hazardParser ??
    (deps.anthropicApiKey === undefined
      ? new NullHazardParser()
      : new AnthropicHazardParser(deps.anthropicApiKey));

  const routeDeps: HazardsRouteDeps = {
    reportHazard: { repo, clock: deps.clock, ids: deps.ids },
    confirmHazard: { repo, clock: deps.clock, ids: deps.ids },
    dismissHazard: { repo },
    getHazard: { repo },
    parseVoiceReport: { parser: hazardParser },
  };

  return {
    registerRoutes(app: FastifyInstance): void {
      registerHazardsRoutes(app, routeDeps);
    },

    async findAvoidanceCandidates(
      corridor: readonly GeoPoint[],
      radiusM: number,
    ): Promise<AvoidanceCandidate[]> {
      const now = deps.clock.now();
      const nearby = await repo.findNearbyLine(corridor, radiusM);
      const candidates: AvoidanceCandidate[] = [];
      for (const report of nearby) {
        if (report.status !== 'active' || isExpired(report, now)) {
          continue;
        }
        const kind = AVOIDANCE_KIND[report.type];
        if (kind === undefined) {
          continue;
        }
        candidates.push({
          id: report.id,
          kind,
          ...(report.measurement === undefined ? {} : { limit: report.measurement.value }),
          location: report.location,
        });
      }
      return candidates;
    },
  };
}
