import type { FasterRouteOfferLog } from '../ports/faster-route-offer-log.js';

export class FakeFasterRouteOfferLog implements FasterRouteOfferLog {
  readonly offers: { tripId: string; at: Date }[] = [];

  offersSince(tripId: string, since: Date): Promise<readonly Date[]> {
    return Promise.resolve(
      this.offers.filter((o) => o.tripId === tripId && o.at >= since).map((o) => o.at),
    );
  }

  record(tripId: string, at: Date): Promise<void> {
    this.offers.push({ tripId, at });
    return Promise.resolve();
  }
}
