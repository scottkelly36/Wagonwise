import type { FasterRouteOfferLog } from '../application/ports/faster-route-offer-log.js';

/** Offers per trip, in memory; an hour's worth is all that is ever read, so older ones are dropped as new ones arrive. */
export class InMemoryFasterRouteOfferLog implements FasterRouteOfferLog {
  readonly #offers = new Map<string, Date[]>();

  offersSince(tripId: string, since: Date): Promise<readonly Date[]> {
    return Promise.resolve((this.#offers.get(tripId) ?? []).filter((at) => at >= since));
  }

  record(tripId: string, at: Date): Promise<void> {
    const kept = (this.#offers.get(tripId) ?? []).filter(
      (t) => at.getTime() - t.getTime() < 60 * 60 * 1000,
    );
    this.#offers.set(tripId, [...kept, at]);
    return Promise.resolve();
  }
}
