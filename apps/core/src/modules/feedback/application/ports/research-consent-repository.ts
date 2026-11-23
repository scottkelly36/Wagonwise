import type { ResearchConsent } from '../../domain/research-consent.js';

/** Where research answers are kept. Append-only. */
export interface ResearchConsentRepository {
  add(consent: ResearchConsent): Promise<void>;
  /** The person's latest answer, or null if they have never answered. */
  latest(staffId: string): Promise<ResearchConsent | null>;
  /** Every person's latest answer where it is yes, newest first. Needs WagonWise staff's scope. */
  latestAgreed(): Promise<readonly ResearchConsent[]>;
}
