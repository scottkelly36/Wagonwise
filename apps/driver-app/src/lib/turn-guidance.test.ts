import type { ManeuverDto } from '@wagonwise/contracts/routing';

import plan from './testing/hexham-hebburn-plan.json';
import { decodePolyline6 } from './polyline';
import { evaluateGuidance, OFF_ROUTE_M, turnOffsets, type Utterance } from './turn-guidance';

const routeLine = decodePolyline6(plan.geometry);
const maneuvers = plan.maneuvers as ManeuverDto[];
const offsets = turnOffsets(routeLine, maneuvers);

/** Drives the whole route, a fix every ~25 m, as the hook would: remembering where it was and what it said. */
function drive(): { spoken: Utterance[]; lastNext: number | undefined } {
  const announced = new Set<string>();
  const spoken: Utterance[] = [];
  let last: number | undefined;
  let lastNext: number | undefined;
  for (let i = 0; i < routeLine.length - 1; i++) {
    const [lon1, lat1] = routeLine[i];
    const [lon2, lat2] = routeLine[i + 1];
    const steps = Math.max(
      1,
      Math.round(Math.hypot((lon2 - lon1) * 64000, (lat2 - lat1) * 111000) / 25),
    );
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const g = evaluateGuidance({
        routeLine,
        maneuvers,
        offsets,
        position: { lat: lat1 + (lat2 - lat1) * t, lon: lon1 + (lon2 - lon1) * t },
        lastTraveledMetres: last,
        announced,
      });
      last = g.traveledMetres;
      lastNext = g.next?.index;
      if (g.utterance) {
        announced.add(g.utterance.key);
        spoken.push(g.utterance);
      }
    }
  }
  return { spoken, lastNext };
}

describe('turn guidance on a real route', () => {
  it('puts every turn at an increasing distance along the route', () => {
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
    }
  });

  it('says each thing once, in UK units, never feet', () => {
    const { spoken } = drive();
    const keys = spoken.map((u) => u.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(spoken.length).toBeGreaterThan(5);
    for (const u of spoken) expect(u.text).not.toMatch(/feet|foot|metre|kilomet/i);
  });

  it('announces every turn that is worth announcing at least once, and arrival last', () => {
    const { spoken } = drive();
    const silent = new Set(['depart', 'straight', 'roundabout_exit']);
    const wanted = maneuvers.map((m, i) => ({ m, i })).filter(({ m }) => !silent.has(m.kind));
    for (const { i } of wanted) {
      expect(spoken.some((u) => u.key.startsWith(`${i}:`))).toBe(true);
    }
    const arriveIndex = maneuvers.findIndex((m) => m.kind === 'arrive');
    expect(spoken[spoken.length - 1].key.startsWith(`${arriveIndex}:`)).toBe(true);
  });

  it('says the turn itself as an urgent bare instruction', () => {
    const { spoken } = drive();
    const urgent = spoken.filter((u) => u.urgent);
    expect(urgent.length).toBeGreaterThan(0);
    for (const u of urgent) expect(u.text).not.toMatch(/^In /);
  });

  it('says nothing until a turn is within range, then reads the distance', () => {
    const first = evaluateGuidance({
      routeLine,
      maneuvers,
      offsets,
      position: { lat: routeLine[0][1], lon: routeLine[0][0] },
      lastTraveledMetres: undefined,
      announced: new Set(),
    });
    expect(first.next).toBeDefined();
    if (first.utterance && !first.utterance.urgent) expect(first.utterance.text).toMatch(/^In /);
    if (first.utterance?.urgent) expect(first.next?.distanceM).toBeLessThanOrEqual(80);
  });
});

describe('off route', () => {
  it('reports how far from the route the driver is', () => {
    const [lon, lat] = routeLine[Math.floor(routeLine.length / 2)];
    const g = evaluateGuidance({
      routeLine,
      maneuvers,
      offsets,
      position: { lat: lat + 0.01, lon }, // about 1.1 km north
      lastTraveledMetres: undefined,
      announced: new Set(),
    });
    expect(g.offRouteMetres).toBeGreaterThan(OFF_ROUTE_M);
  });

  it('is on the route when standing on it', () => {
    const [lon, lat] = routeLine[Math.floor(routeLine.length / 2)];
    const g = evaluateGuidance({
      routeLine,
      maneuvers,
      offsets,
      position: { lat, lon },
      lastTraveledMetres: undefined,
      announced: new Set(),
    });
    expect(g.offRouteMetres).toBeLessThan(5);
  });
});
