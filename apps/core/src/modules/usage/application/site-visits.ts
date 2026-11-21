import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';

/** One counted visit to the website. Nothing in it identifies a person. */
export interface SiteVisit {
  readonly id: string;
  readonly kind: 'view' | 'video_play';
  readonly page: string;
  readonly source: string | undefined;
  readonly campaign: string | undefined;
  readonly at: Date;
}

export interface SiteVisitRepository {
  insert(visit: SiteVisit): Promise<void>;
  deleteBefore(cutoff: Date): Promise<number>;
}

export interface SiteVisitDeps {
  readonly repo: SiteVisitRepository;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** Records one visit, timed by the server's clock (the browser's is not trusted). The input is already checked against the contract. */
export async function recordSiteVisit(
  deps: SiteVisitDeps,
  input: {
    readonly kind: 'view' | 'video_play';
    readonly page: string;
    readonly source?: string | undefined;
    readonly campaign?: string | undefined;
  },
): Promise<void> {
  await deps.repo.insert({
    id: deps.ids.newId(),
    kind: input.kind,
    page: input.page,
    source: input.source,
    campaign: input.campaign,
    at: deps.clock.now(),
  });
}
