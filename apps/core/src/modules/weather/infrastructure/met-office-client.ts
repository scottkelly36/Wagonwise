import type { MultiPolygon, WarningKind, WarningLevel, WeatherWarning } from '../domain/warning.js';

const BASE_URL = 'https://data.hub.api.metoffice.gov.uk/nswws/v1.1/objects/feed';
const REQUEST_TIMEOUT_MS = 15_000;

/** The kinds the Met Office names, matched loosely (it writes e.g. "WIND", "EXTREME HEAT",
 *  "THUNDERSTORM"); anything else is `other`. */
export function kindOf(raw: string): WarningKind {
  const text = raw.toLowerCase();
  if (text.includes('wind')) return 'wind';
  if (text.includes('thunder') || text.includes('lightning')) return 'thunderstorm';
  if (text.includes('snow')) return 'snow';
  if (text.includes('ice') || text.includes('frost')) return 'ice';
  if (text.includes('rain') || text.includes('flood')) return 'rain';
  if (text.includes('fog')) return 'fog';
  if (text.includes('heat')) return 'heat';
  return 'other';
}

function levelOf(raw: unknown): WarningLevel | undefined {
  const text = typeof raw === 'string' ? raw.toLowerCase() : '';
  return text === 'yellow' || text === 'amber' || text === 'red' ? text : undefined;
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function dateOf(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function stringsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return typeof value === 'string' ? [value] : [];
}

/** Whether a value looks like MultiPolygon coordinates; a Polygon is lifted into one. */
function areaOf(geometry: unknown): MultiPolygon | undefined {
  if (typeof geometry !== 'object' || geometry === null) return undefined;
  const { type, coordinates } = geometry as { type?: unknown; coordinates?: unknown };
  if (!Array.isArray(coordinates)) return undefined;
  if (type === 'MultiPolygon') return coordinates as MultiPolygon;
  if (type === 'Polygon') return [coordinates];
  return undefined;
}

/** One GeoJSON feature to a warning; undefined when it is cancelled or missing what we need. A bad
 *  feature is skipped rather than failing the whole fetch. */
export function warningFromFeature(feature: unknown): WeatherWarning | undefined {
  if (typeof feature !== 'object' || feature === null) return undefined;
  const { properties, geometry } = feature as { properties?: unknown; geometry?: unknown };
  if (typeof properties !== 'object' || properties === null) return undefined;
  const p = properties as Record<string, unknown>;

  const status = textOf(p['warningStatus'])?.toLowerCase() ?? '';
  if (status.includes('cancel') || status.includes('expire')) return undefined;

  const level = levelOf(p['warningLevel']);
  const validFrom = dateOf(p['validFromDate']);
  const validTo = dateOf(p['validToDate']);
  const area = areaOf(geometry);
  const id = textOf(p['warningId']);
  if (level === undefined || validFrom === undefined || validTo === undefined) return undefined;
  if (area === undefined || id === undefined) return undefined;

  const kinds = [...new Set(stringsOf(p['weatherType']).map(kindOf))];
  return {
    id,
    level,
    kinds: kinds.length > 0 ? kinds : ['other'],
    headline: textOf(p['warningHeadline']) ?? 'Weather warning',
    details: textOf(p['warningFurtherDetails']),
    validFrom,
    validTo,
    areas: stringsOf(p['affectedAreas']),
    area,
  };
}

export function warningsFromCollection(collection: unknown): WeatherWarning[] {
  const features = (collection as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  return features.flatMap((feature) => {
    const warning = warningFromFeature(feature);
    return warning === undefined ? [] : [warning];
  });
}

/** The URL of the latest warnings, from the Atom feed's `related` link. */
export function relatedLinkOf(atom: string): string | undefined {
  for (const tag of atom.match(/<link\b[^>]*>/g) ?? []) {
    if (/\brel="related"/.test(tag)) return /\bhref="([^"]+)"/.exec(tag)?.[1];
  }
  return undefined;
}

/**
 * The Met Office's National Severe Weather Warning Service (Weather DataHub). The Atom feed names the
 * current set of warnings; that set is a GeoJSON collection with each warning's area. Needs an API key,
 * sent in the `apikey` header.
 */
export class MetOfficeWarningsClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchWarnings(): Promise<WeatherWarning[]> {
    const atom = await this.#get(BASE_URL);
    const link = relatedLinkOf(atom);
    if (link === undefined) throw new Error('Met Office feed has no link to the issued warnings');
    return warningsFromCollection(JSON.parse(await this.#get(link)));
  }

  async #get(url: string): Promise<string> {
    const response = await this.fetchImpl(url, {
      headers: { apikey: this.apiKey },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Met Office responded ${response.status}`);
    return response.text();
  }
}
