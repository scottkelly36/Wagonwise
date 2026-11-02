import type { ClosureCandidate } from '../../domain/closure-on-route.js';
import type { GeoLine } from '../../domain/geo.js';
import type { ClosureAvoidanceQuery } from '../ports/closure-avoidance.js';

/** Configurable result + a log of every route and look-ahead asked about, mirroring `FakeHazardAvoidanceQuery`. `answers` is an
 *  optional per-call queue (consumed in order) for tests where a new route runs into other closures than the old one. */
export class FakeClosureAvoidanceQuery implements ClosureAvoidanceQuery {
  candidates: ClosureCandidate[] = [];
  answers: ClosureCandidate[][] = [];
  readonly asked: { readonly route: GeoLine; readonly withinHours: number }[] = [];

  alongRoute(route: GeoLine, withinHours: number): Promise<ClosureCandidate[]> {
    this.asked.push({ route, withinHours });
    return Promise.resolve(this.answers.shift() ?? this.candidates);
  }
}
