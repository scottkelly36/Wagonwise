import { describe, expect, it } from 'vitest';
import {
  flowFromResponse,
  incidentFromFeature,
  incidentsFromResponse,
  kindOf,
  splitBox,
  TomTomTrafficClient,
} from './tomtom-client.js';

const flowBody = {
  flowSegmentData: { frc: 'FRC3', currentSpeed: 42, freeFlowSpeed: 53, roadClosure: false },
};

const feature = {
  type: 'Feature',
  properties: {
    id: 'abc',
    iconCategory: 1,
    delay: 420,
    events: [{ description: 'Accident', iconCategory: 1 }],
  },
  geometry: {
    type: 'LineString',
    coordinates: [
      [-2.1, 55.0],
      [-2.2, 55.1],
    ],
  },
};

describe('flowFromResponse', () => {
  it('reads the speeds and the closure flag', () => {
    expect(flowFromResponse(flowBody)).toEqual({
      currentSpeedKph: 42,
      freeFlowSpeedKph: 53,
      closed: false,
    });
  });
  it('gives nothing for a body without speeds', () => {
    expect(flowFromResponse({})).toBeUndefined();
    expect(flowFromResponse({ flowSegmentData: { currentSpeed: 10 } })).toBeUndefined();
  });
});

describe('incidents', () => {
  it('maps a feature, taking the first point of a line', () => {
    expect(incidentFromFeature(feature)).toEqual({
      id: 'abc',
      kind: 'accident',
      location: { lat: 55.0, lon: -2.1 },
      description: 'Accident',
      delaySeconds: 420,
    });
  });
  it('skips features with no id or place', () => {
    expect(
      incidentFromFeature({ properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }),
    ).toBeUndefined();
    expect(incidentFromFeature({ properties: { id: 'x' }, geometry: null })).toBeUndefined();
    expect(incidentsFromResponse({ incidents: [feature, {}] })).toHaveLength(1);
  });
  it('groups the icon categories', () => {
    expect(kindOf(8)).toBe('closure');
    expect(kindOf(9)).toBe('roadworks');
    expect(kindOf(6)).toBe('jam');
    expect(kindOf(5)).toBe('hazard');
    expect(kindOf(0)).toBe('other');
  });
});

describe('splitBox', () => {
  it('leaves a small box whole and splits a large one, capped at four', () => {
    expect(splitBox({ minLat: 55, minLon: -2, maxLat: 55.5, maxLon: -1.5 })).toHaveLength(1);
    expect(splitBox({ minLat: 54, minLon: -3, maxLat: 56, maxLon: -1 })).toHaveLength(4);
  });
});

describe('TomTomTrafficClient', () => {
  it('asks for flow at a point and reads the answer', async () => {
    const urls: string[] = [];
    const client = new TomTomTrafficClient('k', (url) => {
      urls.push(typeof url === 'string' ? url : '');
      return Promise.resolve(new Response(JSON.stringify(flowBody), { status: 200 }));
    });
    expect((await client.flowAt({ lat: 55, lon: -2 }))?.currentSpeedKph).toBe(42);
    expect(urls[0]).toContain('flowSegmentData');
    expect(urls[0]).toContain('point=55%2C-2');
  });

  it('treats a 400 from flow as no road here, and any other failure as an error without the key', async () => {
    const noRoad = new TomTomTrafficClient('k', () =>
      Promise.resolve(new Response('{}', { status: 400 })),
    );
    expect(await noRoad.flowAt({ lat: 0, lon: 0 })).toBeUndefined();
    const down = new TomTomTrafficClient('secret-key', () =>
      Promise.resolve(new Response('', { status: 403 })),
    );
    await expect(down.flowAt({ lat: 0, lon: 0 })).rejects.toThrow('TomTom flow responded 403');
    await expect(down.flowAt({ lat: 0, lon: 0 })).rejects.not.toThrow('secret-key');
  });

  it('lists incidents for a box, once each across pieces', async () => {
    const client = new TomTomTrafficClient('k', () =>
      Promise.resolve(new Response(JSON.stringify({ incidents: [feature] }), { status: 200 })),
    );
    const found = await client.incidentsIn({ minLat: 54, minLon: -3, maxLat: 56, maxLon: -1 });
    expect(found.map((i) => i.id)).toEqual(['abc']);
  });
});
