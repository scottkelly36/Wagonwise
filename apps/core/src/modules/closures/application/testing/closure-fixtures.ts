import type { Closure } from '../../domain/closure.js';

/** A closure for tests: an overnight full closure of the M56 near Manchester, with each part overridable. */
export function closure(overrides: Partial<Closure> = {}): Closure {
  return {
    id: 'rec-1',
    situationId: '500000',
    kind: 'full',
    status: 'planned',
    road: 'M56',
    direction: 'eastBound',
    description: 'M56 eastbound jct 7 to 6 carriageway closure',
    locationText: 'M56 eastbound between J7 and J6',
    cause: 'maintenanceWork',
    startsAt: new Date('2026-11-01T22:00:00.000Z'),
    endsAt: new Date('2026-11-02T06:00:00.000Z'),
    lanesClosed: 0,
    position: { lat: 53.36, lon: -2.3 },
    lines: [
      [
        { lat: 53.35, lon: -2.31 },
        { lat: 53.36, lon: -2.3 },
        { lat: 53.37, lon: -2.29 },
      ],
    ],
    updatedAt: new Date('2026-11-01T10:00:00.000Z'),
    ...overrides,
  };
}
