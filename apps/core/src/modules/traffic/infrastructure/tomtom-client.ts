import type { TrafficProvider } from '../application/traffic-provider.js';
import type {
  BoundingBox,
  FlowReading,
  GeoPoint,
  IncidentKind,
  TrafficIncident,
} from '../domain/traffic.js';

const BASE_URL = 'https://api.tomtom.com/traffic/services';
const REQUEST_TIMEOUT_MS = 10_000;
// TomTom refuses an incident box over about 10,000 square km. One degree square is about 7,000 at UK
// latitudes, so a larger box is split into degree squares (and capped, so one long route stays cheap).
const MAX_BOX_DEGREES = 1;
const MAX_BOXES = 4;

/** TomTom's incident icon category to ours. */
export function kindOf(iconCategory: unknown): IncidentKind {
  switch (iconCategory) {
    case 1:
      return 'accident';
    case 7:
    case 8:
      return 'closure';
    case 9:
      return 'roadworks';
    case 6:
      return 'jam';
    case 2:
    case 3:
    case 4:
    case 5:
    case 10:
    case 11:
    case 14:
      return 'hazard';
    default:
      return 'other';
  }
}

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The Flow Segment Data response to a reading; undefined when it has no usable speeds. */
export function flowFromResponse(body: unknown): FlowReading | undefined {
  const data = (body as { flowSegmentData?: Record<string, unknown> } | null)?.flowSegmentData;
  if (typeof data !== 'object' || data === null) return undefined;
  const current = numberOf(data['currentSpeed']);
  const freeFlow = numberOf(data['freeFlowSpeed']);
  if (current === undefined || freeFlow === undefined) return undefined;
  return {
    currentSpeedKph: current,
    freeFlowSpeedKph: freeFlow,
    closed: data['roadClosure'] === true,
  };
}

/** The first coordinate of a GeoJSON Point or LineString, as a point. */
function pointOf(geometry: unknown): GeoPoint | undefined {
  const { type, coordinates } = (geometry ?? {}) as { type?: unknown; coordinates?: unknown };
  const pair =
    type === 'Point'
      ? coordinates
      : type === 'LineString'
        ? (coordinates as unknown[])?.[0]
        : undefined;
  if (!Array.isArray(pair)) return undefined;
  const lon = numberOf(pair[0]);
  const lat = numberOf(pair[1]);
  return lon === undefined || lat === undefined ? undefined : { lat, lon };
}

/** One incident feature to an incident; undefined when it lacks an id or a place. */
export function incidentFromFeature(feature: unknown): TrafficIncident | undefined {
  const { properties, geometry } = (feature ?? {}) as { properties?: unknown; geometry?: unknown };
  if (typeof properties !== 'object' || properties === null) return undefined;
  const p = properties as Record<string, unknown>;
  const id = typeof p['id'] === 'string' ? p['id'] : undefined;
  const location = pointOf(geometry);
  if (id === undefined || location === undefined) return undefined;
  const events = Array.isArray(p['events']) ? (p['events'] as Record<string, unknown>[]) : [];
  const description = events.find((e) => typeof e['description'] === 'string')?.['description'];
  return {
    id,
    kind: kindOf(p['iconCategory']),
    location,
    description: typeof description === 'string' ? description : undefined,
    delaySeconds: numberOf(p['delay']),
  };
}

export function incidentsFromResponse(body: unknown): TrafficIncident[] {
  const incidents = (body as { incidents?: unknown } | null)?.incidents;
  if (!Array.isArray(incidents)) return [];
  return incidents.flatMap((feature) => {
    const incident = incidentFromFeature(feature);
    return incident === undefined ? [] : [incident];
  });
}

/** A box split into pieces no larger than `MAX_BOX_DEGREES` a side, at most `MAX_BOXES` of them. */
export function splitBox(box: BoundingBox): BoundingBox[] {
  const cols = Math.max(1, Math.ceil((box.maxLon - box.minLon) / MAX_BOX_DEGREES));
  const rows = Math.max(1, Math.ceil((box.maxLat - box.minLat) / MAX_BOX_DEGREES));
  const lonStep = (box.maxLon - box.minLon) / cols;
  const latStep = (box.maxLat - box.minLat) / rows;
  const pieces: BoundingBox[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pieces.push({
        minLat: box.minLat + r * latStep,
        maxLat: box.minLat + (r + 1) * latStep,
        minLon: box.minLon + c * lonStep,
        maxLon: box.minLon + (c + 1) * lonStep,
      });
    }
  }
  return pieces.slice(0, MAX_BOXES);
}

const INCIDENT_FIELDS =
  '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,delay,events{description,iconCategory}}}}';

/**
 * TomTom's Traffic Flow (Flow Segment Data) and Traffic Incidents (Incident Details v5) APIs. The key goes
 * in the query string, as TomTom requires, so a URL is never logged or put in an error.
 */
export class TomTomTrafficClient implements TrafficProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async flowAt(point: GeoPoint): Promise<FlowReading | undefined> {
    const params = new URLSearchParams({
      key: this.apiKey,
      point: `${point.lat},${point.lon}`,
      unit: 'KMPH',
    });
    const response = await this.#get(
      `${BASE_URL}/4/flowSegmentData/absolute/10/json?${params}`,
      'flow',
    );
    if (response === undefined) return undefined; // 400: no road near this point
    return flowFromResponse(response);
  }

  async incidentsIn(box: BoundingBox): Promise<TrafficIncident[]> {
    const found: TrafficIncident[] = [];
    for (const piece of splitBox(box)) {
      const params = new URLSearchParams({
        key: this.apiKey,
        bbox: `${piece.minLon},${piece.minLat},${piece.maxLon},${piece.maxLat}`,
        fields: INCIDENT_FIELDS,
        language: 'en-GB',
        timeValidityFilter: 'present',
      });
      found.push(
        ...incidentsFromResponse(
          await this.#get(`${BASE_URL}/5/incidentDetails?${params}`, 'incidents'),
        ),
      );
    }
    const seen = new Set<string>();
    return found.filter((i) => !seen.has(i.id) && seen.add(i.id));
  }

  /** The parsed body; undefined for a 400 from the flow API, which is how it says "no road here". */
  async #get(url: string, what: string): Promise<unknown> {
    const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (response.status === 400 && what === 'flow') return undefined;
    if (!response.ok) throw new Error(`TomTom ${what} responded ${response.status}`);
    return response.json();
  }
}
