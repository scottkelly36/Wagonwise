import { makeId } from '../../../shared/brand.js';
import { detectReroute, type DetectRerouteDeps } from './detect-reroute.js';

/**
 * What `composition/`'s `OutboxDispatcher` actually needs — deliberately not
 * `platform/outbox-dispatcher.ts`'s own `OutboxEventHandler`/`StoredDomainEvent` types, since
 * modules may never import `platform/` (AGENTS.md rule 1). `compose-core.ts` (which *can* import
 * both) assigns a `RoutingEventHandler[]` into an `OutboxEventHandler[]` — structurally
 * identical, so it type-checks with no cast needed.
 */
export interface RoutingEventHandler {
  readonly handlerName: string;
  readonly eventType: string;
  handle(event: { readonly payload: unknown }): Promise<void>;
}

interface RawHazardEventPayload {
  readonly hazardId: string;
  readonly location: { readonly lat: number; readonly lon: number };
  readonly reporterId?: string;
}

/** Never trusts the outbox row's JSON payload blindly — it crossed a serialization boundary, so
 *  a malformed shape is a real (if unexpected) possibility, not just a type-system formality.
 *  Throws rather than silently no-op'ing on a bad payload: `OutboxDispatcher` treats a throw as a
 *  failed attempt (retried, eventually dead-lettered) — the visible failure a genuine bug in
 *  hazards' own event-publishing code deserves, instead of a silently-swallowed no-op. */
function parseHazardEventPayload(payload: unknown): RawHazardEventPayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('detect-reroute: payload is not an object');
  }
  const p = payload as Record<string, unknown>;
  const location = p.location;
  if (
    typeof p.hazardId !== 'string' ||
    typeof location !== 'object' ||
    location === null ||
    typeof (location as Record<string, unknown>).lat !== 'number' ||
    typeof (location as Record<string, unknown>).lon !== 'number'
  ) {
    throw new Error('detect-reroute: payload missing hazardId or location');
  }
  const loc = location as Record<string, unknown>;
  return {
    hazardId: p.hazardId,
    location: { lat: loc.lat as number, lon: loc.lon as number },
    ...(typeof p.reporterId === 'string' ? { reporterId: p.reporterId } : {}),
  };
}

/** `HazardReported` carries a reporter to exclude (design doc §6's "don't notify the driver who
 *  made the report"). */
export function createHazardReportedRerouteHandler(deps: DetectRerouteDeps): RoutingEventHandler {
  return {
    handlerName: 'routing.detect-reroute-on-hazard-reported',
    eventType: 'HazardReported',
    async handle(event: { readonly payload: unknown }): Promise<void> {
      const parsed = parseHazardEventPayload(event.payload);
      await detectReroute(deps, {
        hazardId: parsed.hazardId,
        location: parsed.location,
        ...(parsed.reporterId === undefined
          ? {}
          : { excludeDriverId: makeId<'DriverId'>(parsed.reporterId) }),
      });
    },
  };
}

/** `HazardConfirmed` has no single reporter to exclude (hazards/domain/events.ts's own doc
 *  comment on `hazardConfirmedEvent` — a merge-triggered confirmation has no one caller either). */
export function createHazardConfirmedRerouteHandler(deps: DetectRerouteDeps): RoutingEventHandler {
  return {
    handlerName: 'routing.detect-reroute-on-hazard-confirmed',
    eventType: 'HazardConfirmed',
    async handle(event: { readonly payload: unknown }): Promise<void> {
      const parsed = parseHazardEventPayload(event.payload);
      await detectReroute(deps, { hazardId: parsed.hazardId, location: parsed.location });
    },
  };
}
