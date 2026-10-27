import { err, ok, type Result } from '../../../shared/result.js';
import type { FuelSource } from '../application/fuel-source.js';
import {
  isFuelType,
  isPlausiblePencePerLitre,
  isPlausibleUkPosition,
  type FuelPrice,
  type FuelSourceUnavailable,
  type FuelStation,
} from '../domain/fuel.js';

const REQUEST_TIMEOUT_MS = 30_000;
/** A token is renewed this long before Fuel Finder says it runs out (it lasts an hour). */
const TOKEN_MARGIN_MS = 5 * 60_000;
/** The limit is 100 requests a minute and one at a time; 700 ms between requests keeps well under it. */
const MIN_GAP_MS = 700;
const MAX_RETRIES_AFTER_LIMIT = 3;
const DEFAULT_RETRY_AFTER_MS = 5_000;
const MAX_RETRY_AFTER_MS = 60_000;
/** About 17 batches of 500 hold every station in the country; far more than that means the end is not being found. */
const MAX_BATCHES = 100;
/** Sent only to the Fuel Finder service. */
const SCOPE = 'fuelfinder.read';

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Unavailable = Result<never, FuelSourceUnavailable>;
const unavailable: Unavailable = err({ tag: 'FuelSourceUnavailable' });

export interface FuelFinderCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
  /** The service's address with no trailing slash, e.g. `https://www.fuel-finder.service.gov.uk/api/v1`. */
  readonly baseUrl: string;
}

const textOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
const recordOf = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
function numberOf(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/**
 * One station from Fuel Finder's `/pfs` list; undefined when it has no id, name or usable position. A station with no position
 * cannot be found by "near me", so it is left out rather than guessed.
 */
export function stationFromRecord(raw: unknown): FuelStation | undefined {
  const record = recordOf(raw);
  const id = textOf(record?.['node_id']);
  const name = textOf(record?.['trading_name']);
  const location = recordOf(record?.['location']);
  const lat = numberOf(location?.['latitude']);
  const lon = numberOf(location?.['longitude']);
  if (record === undefined || id === undefined || name === undefined) return undefined;
  if (lat === undefined || lon === undefined || !isPlausibleUkPosition({ lat, lon })) {
    return undefined;
  }
  const amenities = Array.isArray(record['amenities'])
    ? record['amenities'].filter((a): a is string => typeof a === 'string')
    : [];
  return {
    id,
    name,
    brand: textOf(record['brand_name']),
    addressLine: textOf(location?.['address_line_1']),
    city: textOf(location?.['city']),
    postcode: textOf(location?.['postcode']),
    phone: textOf(record['public_phone_number']),
    position: { lat, lon },
    isMotorway: record['is_motorway_service_station'] === true,
    isSupermarket: record['is_supermarket_service_station'] === true,
    closed: record['temporary_closure'] === true || record['permanent_closure'] === true,
    amenities,
  };
}

/**
 * The prices from one station's entry in `/pfs/fuel-prices`. A price is left out when its fuel is not one we know, its amount is
 * not a believable pump price, or it has no readable date; the rest of the station's prices still count.
 */
export function pricesFromRecord(raw: unknown): FuelPrice[] {
  const record = recordOf(raw);
  const stationId = textOf(record?.['node_id']);
  const entries = record?.['fuel_prices'];
  if (stationId === undefined || !Array.isArray(entries)) return [];
  const prices: FuelPrice[] = [];
  for (const entry of entries) {
    const item = recordOf(entry);
    const fuelType = textOf(item?.['fuel_type'])?.toUpperCase();
    const pencePerLitre = numberOf(item?.['price']);
    const updated = textOf(item?.['price_last_updated']);
    const updatedAt = updated === undefined ? undefined : new Date(updated);
    if (fuelType === undefined || !isFuelType(fuelType)) continue;
    if (pencePerLitre === undefined || !isPlausiblePencePerLitre(pencePerLitre)) continue;
    if (updatedAt === undefined || Number.isNaN(updatedAt.getTime())) continue;
    prices.push({ stationId, fuelType, pencePerLitre, updatedAt });
  }
  return prices;
}

/** How long the service asked us to wait (`Retry-After`, in seconds), kept between a sensible floor and ceiling. */
function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('retry-after'));
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_RETRY_AFTER_MS;
  return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
}

/**
 * The government's Fuel Finder public API: every station (`/pfs`) and every price (`/pfs/fuel-prices`), 500 at a time. It signs in
 * with a client id and secret (a token that lasts an hour, kept and renewed here), asks for one request at a time and no faster
 * than the 100 a minute allowed, and waits when told to slow down. The secret is only ever sent to the token address: it is not
 * logged, not put in an error and not in any other URL. Any failure part-way fails the whole fetch, because half the stations
 * would look like a country with no petrol stations. `fetch`, the clock and the wait are injected for tests.
 */
export class FuelFinderClient implements FuelSource {
  readonly enabled = true;
  #token: { value: string; expiresAt: number } | undefined;
  #lastRequestAt = 0;

  constructor(
    private readonly credentials: FuelFinderCredentials,
    private readonly fetchFn: Fetch = (url, init) => fetch(url, init),
    private readonly onProblem: (what: string, detail: unknown) => void = () => undefined,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  fetchStations(): Promise<Result<readonly FuelStation[], FuelSourceUnavailable>> {
    return this.#fetchAll('pfs', (raw) => {
      const station = stationFromRecord(raw);
      return station === undefined ? [] : [station];
    });
  }

  fetchPrices(): Promise<Result<readonly FuelPrice[], FuelSourceUnavailable>> {
    return this.#fetchAll('pfs/fuel-prices', pricesFromRecord);
  }

  /** Batches from 1 until the service says there are no more (a 404 or an empty batch). */
  async #fetchAll<T>(
    path: string,
    parse: (raw: unknown) => readonly T[],
  ): Promise<Result<readonly T[], FuelSourceUnavailable>> {
    const all: T[] = [];
    for (let batch = 1; batch <= MAX_BATCHES; batch++) {
      const response = await this.#get(`${path}?batch-number=${batch}`);
      if (response === undefined) return unavailable;
      if (response.status === 404) {
        // Past the last batch. A 404 on the first means there is nothing to read, which is never right.
        if (batch > 1) return ok(all);
        this.onProblem('Fuel Finder had no first batch', { path, status: 404 });
        return unavailable;
      }
      if (!response.ok) {
        this.onProblem('Fuel Finder refused the request', { path, status: response.status });
        return unavailable;
      }
      const body: unknown = await response.json().catch(() => undefined);
      if (!Array.isArray(body)) {
        this.onProblem('Fuel Finder sent something that is not a list', { path, batch });
        return unavailable;
      }
      if (body.length === 0) return ok(all);
      for (const raw of body) all.push(...parse(raw));
    }
    this.onProblem('Fuel Finder did not reach an end', { path, batches: MAX_BATCHES });
    return unavailable;
  }

  /** One GET with the token, paced, renewing a refused token once and waiting out a "slow down". Undefined: could not get an answer. */
  async #get(path: string): Promise<Response | undefined> {
    let renewed = false;
    let limited = 0;
    for (;;) {
      await this.#pace();
      const token = await this.#accessToken();
      if (token === undefined) return undefined;
      let response: Response;
      try {
        response = await this.fetchFn(`${this.credentials.baseUrl}/${path}`, {
          headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        this.onProblem('Fuel Finder could not be reached', error);
        return undefined;
      }
      if (response.status === 401 && !renewed) {
        renewed = true;
        this.#token = undefined;
        continue;
      }
      if (response.status === 429 && limited < MAX_RETRIES_AFTER_LIMIT) {
        limited += 1;
        await this.sleep(retryAfterMs(response));
        continue;
      }
      return response;
    }
  }

  /** Waits until the gap since the last request has passed. */
  async #pace(): Promise<void> {
    const wait = this.#lastRequestAt + MIN_GAP_MS - this.now();
    if (wait > 0) await this.sleep(wait);
    this.#lastRequestAt = this.now();
  }

  async #accessToken(): Promise<string | undefined> {
    const kept = this.#token;
    if (kept !== undefined && kept.expiresAt > this.now()) return kept.value;
    try {
      const response = await this.fetchFn(
        `${this.credentials.baseUrl}/oauth/generate_access_token`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
          },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.credentials.clientId,
            client_secret: this.credentials.clientSecret,
            scope: SCOPE,
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        this.onProblem('Fuel Finder refused the sign-in', { status: response.status });
        return undefined;
      }
      // The token sits inside `data`, next to `expires_in` (seconds).
      const body = recordOf(await response.json().catch(() => undefined));
      const data = recordOf(body?.['data']);
      const value = textOf(data?.['access_token']);
      if (value === undefined) {
        this.onProblem('Fuel Finder answered the sign-in without a token', undefined);
        return undefined;
      }
      const seconds = numberOf(data?.['expires_in']) ?? 3600;
      this.#token = { value, expiresAt: this.now() + seconds * 1000 - TOKEN_MARGIN_MS };
      return value;
    } catch (error) {
      this.onProblem('Fuel Finder could not be reached to sign in', error);
      return undefined;
    }
  }
}

/** Used when no credentials are set: every fetch is unavailable and no request is made. */
export class NoFuelSource implements FuelSource {
  readonly enabled = false;
  fetchStations(): Promise<Unavailable> {
    return Promise.resolve(unavailable);
  }
  fetchPrices(): Promise<Unavailable> {
    return Promise.resolve(unavailable);
  }
}
