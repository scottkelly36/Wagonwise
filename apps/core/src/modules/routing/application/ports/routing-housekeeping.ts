/** Deleting routing's own rows in bulk: a driver's data when they delete their account, and old
 *  route plans and trips by age. */
export interface RoutingHousekeeping {
  /** Deletes the driver's vehicle profiles, route plans, trips and reroute alerts. */
  eraseDriver(driverId: string): Promise<void>;
  /** Deletes route plans created before `cutoff` that no running trip still uses, with their ended
   *  trips and reroute alerts, and says how many plans went. */
  deletePlansOlderThan(cutoff: Date): Promise<number>;
}
