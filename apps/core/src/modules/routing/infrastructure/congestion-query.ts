import type { CongestionModule } from '../../congestion/api.js';
import type { CongestionQuery, CongestionWait } from '../application/ports/congestion-query.js';
import type { GeoPoint } from '../domain/geo.js';

/** Wraps `congestion`'s facade so routing never imports its types (AGENTS.md rule 7). */
export class CongestionQueryAdapter implements CongestionQuery {
  constructor(private readonly congestion: Pick<CongestionModule, 'findNearby'>) {}

  async waitsNear(line: readonly GeoPoint[], radiusM: number): Promise<CongestionWait[]> {
    const reports = await this.congestion.findNearby(line, radiusM);
    return reports.map((r) => ({
      id: r.id,
      location: r.location,
      waitMinutes: r.estimatedWaitMinutes,
    }));
  }
}
