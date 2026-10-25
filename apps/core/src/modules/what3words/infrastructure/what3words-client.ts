import { err, ok, type Result } from '../../../shared/result.js';
import type { WordsProvider } from '../application/words-provider.js';
import type {
  GeoPoint,
  LookupUnavailable,
  What3wordsAddress,
  WordsNotFound,
} from '../domain/words.js';

const BASE_URL = 'https://api.what3words.com/v3';
const REQUEST_TIMEOUT_MS = 8_000;

type Fetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>;
type Answer = Result<What3wordsAddress, WordsNotFound | LookupUnavailable>;

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** The service's answer as an address; undefined when it is missing the words or the position. */
export function addressFromResponse(body: unknown): What3wordsAddress | undefined {
  const data = body as {
    words?: unknown;
    coordinates?: { lat?: unknown; lng?: unknown };
    nearestPlace?: unknown;
    country?: unknown;
  } | null;
  const words = textOf(data?.words);
  const lat = numberOf(data?.coordinates?.lat);
  const lon = numberOf(data?.coordinates?.lng);
  if (words === undefined || lat === undefined || lon === undefined) return undefined;
  return {
    words,
    location: { lat, lon },
    nearestPlace: textOf(data?.nearestPlace),
    country: textOf(data?.country),
  };
}

/**
 * what3words' Convert to Coordinates and Convert to 3 Word Address. The key goes in a header, never in a URL that could be logged. A
 * request that fails, times out or is refused (a bad key, the monthly allowance used up) is `LookupUnavailable` and is reported once
 * through `onProblem`, so a driver carries on without the lookup instead of seeing an error from a third party. Nothing is kept: each
 * lookup is a fresh call (the plan is billed by lookup, so the app asks only when the driver asks).
 */
export class What3wordsClient implements WordsProvider {
  readonly enabled = true;

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: Fetch = (url, init) => fetch(url, init),
    private readonly onProblem: (what: string, detail: unknown) => void = () => undefined,
  ) {}

  toLocation(words: string): Promise<Answer> {
    return this.call(`convert-to-coordinates?words=${encodeURIComponent(words)}`);
  }

  toWords(point: GeoPoint): Promise<Answer> {
    return this.call(`convert-to-3wa?coordinates=${point.lat},${point.lon}&language=en`);
  }

  private async call(path: string): Promise<Answer> {
    try {
      const response = await this.fetchFn(`${BASE_URL}/${path}`, {
        headers: { 'X-Api-Key': this.apiKey },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body: unknown = await response.json().catch(() => undefined);
      if (response.ok) {
        const address = addressFromResponse(body);
        if (address !== undefined) return ok(address);
        this.onProblem('what3words answered without an address', undefined);
        return err({ tag: 'LookupUnavailable' });
      }
      const code = (body as { error?: { code?: unknown } } | undefined)?.error?.code;
      // A mistyped or non-existent address is the driver's to fix; everything else (key, allowance, outage) is ours.
      if (code === 'BadWords' || code === 'BadCoordinates') return err({ tag: 'WordsNotFound' });
      this.onProblem('what3words refused the request', { status: response.status, code });
      return err({ tag: 'LookupUnavailable' });
    } catch (error) {
      this.onProblem('what3words could not be reached', error);
      return err({ tag: 'LookupUnavailable' });
    }
  }
}

/** Used when no key is set: every lookup is unavailable and no request is made. */
export class NoWordsProvider implements WordsProvider {
  readonly enabled = false;
  toLocation(): Promise<Answer> {
    return Promise.resolve(err({ tag: 'LookupUnavailable' }));
  }
  toWords(): Promise<Answer> {
    return Promise.resolve(err({ tag: 'LookupUnavailable' }));
  }
}
