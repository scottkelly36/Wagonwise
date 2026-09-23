/**
 * A fact about something that happened to an aggregate (design doc §3/§11), published through
 * the transactional outbox (`outbox.events`) so nothing is lost on a crash between saving the
 * aggregate and notifying whoever cares. Plain data, matching every aggregate's own style — no
 * event base class.
 *
 * `payload` is `unknown` here deliberately: each event type (e.g. `HazardReported`) defines its
 * own payload shape where it's raised, not in this shared kernel file, the same way `Result<T, E>`
 * doesn't know what `E` a given use case returns.
 */
export interface DomainEvent<Payload = unknown> {
  readonly eventId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly payload: Payload;
}
