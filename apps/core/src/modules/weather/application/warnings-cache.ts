import type { Clock } from '../../../shared/ports/clock.js';
import {
  areaContains,
  bySeverity,
  isCurrentOrUpcoming,
  type WeatherWarning,
} from '../domain/warning.js';

/** Where warnings come from (the Met Office in production, a fake in tests). */
export interface WarningSource {
  fetchWarnings(): Promise<WeatherWarning[]>;
}

/**
 * The latest warnings, kept in memory: they are public data that changes a few times a day and is
 * fetched again every few minutes, so nothing is stored. A failed fetch keeps the last good set
 * rather than clearing it, and the caller (a periodic task) logs the failure.
 */
export class WarningsCache {
  #warnings: readonly WeatherWarning[] = [];
  #updatedAt: Date | undefined;

  constructor(
    private readonly source: WarningSource | undefined,
    private readonly clock: Clock,
  ) {}

  /** Whether a source is configured; without one there are never any warnings. */
  get enabled(): boolean {
    return this.source !== undefined;
  }

  async refresh(): Promise<void> {
    if (this.source === undefined) return;
    this.#warnings = await this.source.fetchWarnings();
    this.#updatedAt = this.clock.now();
  }

  /** Warnings in force or starting within a day, most severe first. */
  current(): { readonly warnings: WeatherWarning[]; readonly updatedAt: Date | undefined } {
    const now = this.clock.now();
    return {
      warnings: this.#warnings.filter((w) => isCurrentOrUpcoming(w, now)).sort(bySeverity),
      updatedAt: this.#updatedAt,
    };
  }

  /** The current warnings whose area contains the point. */
  at(point: { readonly lat: number; readonly lon: number }): WeatherWarning[] {
    return this.current().warnings.filter((w) => areaContains(w.area, point));
  }
}
