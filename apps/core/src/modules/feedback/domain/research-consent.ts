/**
 * One answer to "WagonWise may contact me from time to time to ask for feedback" (docs/company-account-states-scope.md, "Market research
 * contact"). Kept as a row each time, with the version of the wording shown, so it can be shown what a person agreed to. The person's
 * current answer is their latest row, and it only counts if it was given to the wording that applies now.
 */
export interface ResearchConsent {
  readonly id: string;
  readonly staffId: string;
  readonly companyId: string;
  readonly agreed: boolean;
  readonly wordingVersion: number;
  readonly at: Date;
}

/** Whether a person may be contacted for research: their latest answer is yes, and was given to the wording that applies now. */
export function mayContact(latest: ResearchConsent | null, currentVersion: number): boolean {
  return latest !== null && latest.agreed && latest.wordingVersion === currentVersion;
}
