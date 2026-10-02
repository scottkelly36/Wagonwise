/** A driver's normalised sign-in identifier (phone or email), which is how an invitation made
 *  before they had an account is matched to them. fleet owns this port in its own terms (AGENTS.md
 *  rule 7); composition supplies it over identity. `null` for an unknown or deleted driver. */
export interface DriverIdentityDirectory {
  getIdentifier(driverId: string): Promise<string | null>;
}

/** Company names by id, for showing a driver who an invitation or request is with. Composition
 *  supplies it over companies. Ids that match no company are absent. */
export interface CompanyNameDirectory {
  namesFor(companyIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
