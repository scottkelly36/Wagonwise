/**
 * Removes whatever other parts of the system hold about a driver, when they delete their account.
 * Defined here, in identity's terms, and supplied by composition over the other modules (AGENTS.md
 * rule 7): identity never learns what a vehicle profile or a route plan is.
 *
 * Must be safe to run twice: deleting an account is retried if it fails part-way, and every part
 * runs again.
 */
export interface DriverDataEraser {
  /** `identifier` is the driver's sign-in email or phone as it was before the account was scrubbed,
   *  for data held against that rather than the driver id (invitations made to it). */
  erase(input: { readonly driverId: string; readonly identifier: string }): Promise<void>;
}
