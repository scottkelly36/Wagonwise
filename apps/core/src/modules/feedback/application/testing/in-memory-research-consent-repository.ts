import type { ResearchConsent } from '../../domain/research-consent.js';
import type { ResearchConsentRepository } from '../ports/research-consent-repository.js';

export class InMemoryResearchConsentRepository implements ResearchConsentRepository {
  readonly rows: ResearchConsent[] = [];

  add(consent: ResearchConsent): Promise<void> {
    this.rows.push(consent);
    return Promise.resolve();
  }

  latest(staffId: string): Promise<ResearchConsent | null> {
    const mine = this.rows.filter((r) => r.staffId === staffId);
    return Promise.resolve(mine.at(-1) ?? null);
  }

  latestAgreed(): Promise<readonly ResearchConsent[]> {
    const latest = new Map<string, ResearchConsent>();
    for (const row of this.rows) latest.set(row.staffId, row);
    return Promise.resolve(
      [...latest.values()].filter((r) => r.agreed).sort((a, b) => b.at.getTime() - a.at.getTime()),
    );
  }
}
