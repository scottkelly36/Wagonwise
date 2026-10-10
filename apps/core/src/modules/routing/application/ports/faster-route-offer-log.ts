/** When a trip was last offered a faster route, so the offers do not nag. Kept in memory: a restart forgets it,
 *  which at worst allows one extra offer. */
export interface FasterRouteOfferLog {
  /** Times of this trip's offers since `since`, oldest first. */
  offersSince(tripId: string, since: Date): Promise<readonly Date[]>;
  record(tripId: string, at: Date): Promise<void>;
}
