import { err, ok, type Result } from '../../../shared/result.js';
import type {
  LookupNotFound,
  LookupUnavailable,
  VehicleDates,
  VehicleLookup,
} from '../application/ports/vehicle-lookup.js';
import { ukDay, validateDay, type DayString } from '../domain/maintenance.js';

const BASE_URL = 'https://history.mot.api.gov.uk';
const REQUEST_TIMEOUT_MS = 10_000;
/** A token is renewed this long before DVSA says it runs out. */
const TOKEN_MARGIN_MS = 5 * 60_000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface DvsaMotCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly apiKey: string;
  /** The Microsoft sign-in address from DVSA's credentials email (it contains the tenant id). */
  readonly tokenUrl: string;
  readonly scope: string;
}

export const DVSA_DEFAULT_SCOPE = 'https://tapi.dvsa.gov.uk/.default';

function dayOf(value: unknown): DayString | undefined {
  if (typeof value !== 'string') return undefined;
  const day = validateDay(value);
  return day.ok ? day.value : undefined;
}

/**
 * The MOT (or HGV annual test) dates from DVSA's history of a vehicle: when the last passed test runs out, and whether that
 * is still in the future. A later failed test does not cancel an earlier pass: the old certificate still counts until it runs
 * out. A vehicle with no passed test has no date, unless DVSA gives the day its first test is due. Road tax is not in this
 * record. Anything unexpected is left out rather than guessed.
 */
export function motDatesFromHistory(body: unknown, today: DayString): VehicleDates {
  const vehicle = (Array.isArray(body) ? body[0] : body) as
    Record<string, unknown> | null | undefined;
  const data = typeof vehicle === 'object' && vehicle !== null ? vehicle : {};
  const tests = Array.isArray(data['motTests'])
    ? (data['motTests'] as Record<string, unknown>[])
    : [];

  let latest: { completed: string; expiry: DayString } | undefined;
  for (const test of tests) {
    if (test['testResult'] !== 'PASSED') continue;
    const expiry = dayOf(test['expiryDate']);
    const completed = typeof test['completedDate'] === 'string' ? test['completedDate'] : '';
    if (expiry === undefined) continue;
    if (latest === undefined || completed > latest.completed) latest = { completed, expiry };
  }
  if (latest !== undefined) {
    return {
      motExpiry: latest.expiry,
      motStatus: latest.expiry >= today ? 'Valid' : 'Expired',
      taxDue: undefined,
      taxStatus: undefined,
    };
  }
  const firstDue = dayOf(data['motTestDueDate']);
  return {
    motExpiry: firstDue,
    motStatus: firstDue === undefined ? 'No test on record' : 'No test yet',
    taxDue: undefined,
    taxStatus: undefined,
  };
}

/** Registrations are sent without spaces, in capitals. */
const normalise = (registration: string): string => registration.replace(/\s+/g, '').toUpperCase();

/**
 * DVSA's MOT history API: the test history of a vehicle by registration, which includes HGVs, trailers and buses from 2018. It
 * signs in with a client id and secret (a Microsoft token that lasts about an hour, kept and renewed here) and sends the API
 * key with each request. None of the secrets are logged or put in an error. `fetch` and the clock are injected for tests.
 */
export class DvsaMotHistory implements VehicleLookup {
  readonly configured = true;
  #token: { value: string; expiresAt: number } | undefined;
  #pending: Promise<string | undefined> | undefined;

  constructor(
    private readonly credentials: DvsaMotCredentials,
    private readonly doFetch: Fetch = (url, init) => fetch(url, init),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async lookup(
    registration: string,
  ): Promise<Result<VehicleDates, LookupNotFound | LookupUnavailable>> {
    const url = `${BASE_URL}/v1/trade/vehicles/registration/${encodeURIComponent(normalise(registration))}`;
    let response = await this.#get(url, false);
    // A refused token (revoked, or older than we thought) is renewed once and tried again.
    if (response !== undefined && (response.status === 401 || response.status === 403)) {
      response = await this.#get(url, true);
    }
    if (response === undefined) return err({ tag: 'LookupUnavailable' });
    if (response.status === 404 || response.status === 400) return err({ tag: 'LookupNotFound' });
    if (!response.ok) return err({ tag: 'LookupUnavailable' });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return err({ tag: 'LookupUnavailable' });
    }
    return ok(motDatesFromHistory(body, ukDay(this.now())));
  }

  async #get(url: string, renew: boolean): Promise<Response | undefined> {
    const token = await this.#accessToken(renew);
    if (token === undefined) return undefined;
    try {
      return await this.doFetch(url, {
        headers: {
          authorization: `Bearer ${token}`,
          'x-api-key': this.credentials.apiKey,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return undefined;
    }
  }

  /** The kept token, or a fresh one. Concurrent callers share one sign-in. */
  #accessToken(renew: boolean): Promise<string | undefined> {
    const kept = this.#token;
    if (!renew && kept !== undefined && kept.expiresAt > this.now().getTime()) {
      return Promise.resolve(kept.value);
    }
    this.#pending ??= this.#signIn().finally(() => {
      this.#pending = undefined;
    });
    return this.#pending;
  }

  async #signIn(): Promise<string | undefined> {
    try {
      const response = await this.doFetch(this.credentials.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.credentials.clientId,
          client_secret: this.credentials.clientSecret,
          scope: this.credentials.scope,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
      if (typeof body.access_token !== 'string' || body.access_token === '') return undefined;
      const seconds = typeof body.expires_in === 'number' ? body.expires_in : 3600;
      this.#token = {
        value: body.access_token,
        expiresAt: this.now().getTime() + seconds * 1000 - TOKEN_MARGIN_MS,
      };
      return this.#token.value;
    } catch {
      return undefined;
    }
  }
}
