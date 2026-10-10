import type {
  GeoPoint,
  ParkingSource,
  SafeParkingSpot,
  SafeParkingSpotId,
  SpotReport,
} from '../../domain/safe-parking-spot.js';
import type { ParkingRepository, SpotSearch } from '../ports/parking-repository.js';

/** Flat-earth distance, good enough for a fake used only in unit tests — same approximation as
 *  hazards'/congestion's own in-memory repositories. */
function metresBetween(a: GeoPoint, b: GeoPoint): number {
  const METRES_PER_DEGREE_LAT = 111_320;
  const dLat = (a.lat - b.lat) * METRES_PER_DEGREE_LAT;
  const dLon = (a.lon - b.lon) * METRES_PER_DEGREE_LAT * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

export class InMemoryParkingRepository implements ParkingRepository {
  #byId = new Map<SafeParkingSpotId, SafeParkingSpot>();
  #reports = new Map<string, SpotReport>();

  /** The spot as the map would see it: with how many drivers reported it and their newest notes. */
  #view(spot: SafeParkingSpot): SafeParkingSpot {
    const reports = [...this.#reports.values()]
      .filter((r) => r.spotId === spot.id)
      .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
    return {
      ...spot,
      lastReportedAt: spot.lastReportedAt ?? spot.reportedAt,
      reporterCount: new Set(reports.map((r) => r.reporterId)).size,
      recentNotes: reports
        .filter((r) => r.note !== undefined)
        .slice(0, 3)
        .map((r) => r.note as string),
    };
  }

  findNearbyLine(points: readonly GeoPoint[], radiusM: number): Promise<SafeParkingSpot[]> {
    const matches = [...this.#byId.values()]
      .filter((spot) => points.some((p) => metresBetween(spot.location, p) <= radiusM))
      .map((spot) => this.#view(spot))
      .sort(
        (a, b) =>
          (b.lastReportedAt ?? b.reportedAt).getTime() -
          (a.lastReportedAt ?? a.reportedAt).getTime(),
      );
    return Promise.resolve(matches);
  }

  findNearest(point: GeoPoint, radiusM: number): Promise<SafeParkingSpot | null> {
    let best: { spot: SafeParkingSpot; metres: number } | undefined;
    for (const spot of this.#byId.values()) {
      const metres = metresBetween(spot.location, point);
      if (metres <= radiusM && (best === undefined || metres < best.metres))
        best = { spot, metres };
    }
    return Promise.resolve(best === undefined ? null : this.#view(best.spot));
  }

  addReport(report: SpotReport): Promise<boolean> {
    if (this.#reports.has(report.id)) return Promise.resolve(false);
    this.#reports.set(report.id, report);
    const spot = this.#byId.get(report.spotId);
    if (spot !== undefined) {
      const last = spot.lastReportedAt ?? spot.reportedAt;
      const newer = report.reportedAt.getTime() >= last.getTime();
      this.#byId.set(report.spotId, {
        ...spot,
        kind: 'parking',
        lastReportedAt: newer ? report.reportedAt : last,
        note:
          spot.source === 'driver' && report.note !== undefined && newer ? report.note : spot.note,
      });
    }
    return Promise.resolve(true);
  }

  findReport(id: string): Promise<SpotReport | null> {
    return Promise.resolve(this.#reports.get(id) ?? null);
  }

  removeReport(id: string, reporterId: string): Promise<boolean> {
    const report = this.#reports.get(id);
    if (report === undefined || report.reporterId !== reporterId) return Promise.resolve(false);
    this.#reports.delete(id);
    const spot = this.#byId.get(report.spotId);
    if (spot !== undefined) {
      const remaining = [...this.#reports.values()]
        .filter((r) => r.spotId === spot.id)
        .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
      if (spot.source === 'driver' && remaining.length === 0) {
        this.#byId.delete(spot.id);
      } else {
        this.#byId.set(spot.id, {
          ...spot,
          lastReportedAt: remaining[0]?.reportedAt ?? spot.reportedAt,
          note:
            spot.source === 'driver'
              ? remaining.find((r) => r.note !== undefined)?.note
              : spot.note,
        });
      }
    }
    return Promise.resolve(true);
  }

  search(search: SpotSearch): Promise<{ spots: SafeParkingSpot[]; total: number }> {
    const text = search.text?.toLowerCase();
    const matches = [...this.#byId.values()]
      .filter((s) => search.source === undefined || s.source === search.source)
      .filter(
        (s) =>
          text === undefined ||
          (s.name ?? '').toLowerCase().includes(text) ||
          (s.note ?? '').toLowerCase().includes(text),
      )
      .map((s) => this.#view(s))
      .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
    return Promise.resolve({ spots: matches.slice(0, search.limit), total: matches.length });
  }

  countBySource(): Promise<Record<ParkingSource, number>> {
    const counts: Record<ParkingSource, number> = { driver: 0, admin: 0, osm: 0 };
    for (const s of this.#byId.values()) counts[s.source] += 1;
    return Promise.resolve(counts);
  }

  find(id: SafeParkingSpotId): Promise<SafeParkingSpot | null> {
    const spot = this.#byId.get(id);
    return Promise.resolve(spot === undefined ? null : this.#view(spot));
  }

  update(spot: SafeParkingSpot): Promise<boolean> {
    if (!this.#byId.has(spot.id)) return Promise.resolve(false);
    this.#byId.set(spot.id, spot);
    return Promise.resolve(true);
  }

  deleteAny(id: SafeParkingSpotId): Promise<boolean> {
    for (const [reportId, r] of this.#reports) if (r.spotId === id) this.#reports.delete(reportId);
    return Promise.resolve(this.#byId.delete(id));
  }

  save(spot: SafeParkingSpot): Promise<void> {
    this.#byId.set(spot.id, spot);
    if (spot.reporterId !== undefined) {
      this.#reports.set(spot.id, {
        id: spot.id,
        spotId: spot.id,
        reporterId: spot.reporterId,
        note: spot.note,
        reportedAt: spot.reportedAt,
      });
    }
    return Promise.resolve();
  }
}
