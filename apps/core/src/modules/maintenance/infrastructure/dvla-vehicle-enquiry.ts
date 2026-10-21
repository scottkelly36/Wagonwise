import { err, ok, type Result } from '../../../shared/result.js';
import type {
  LookupNotFound,
  LookupUnavailable,
  VehicleDates,
  VehicleLookup,
} from '../application/ports/vehicle-lookup.js';
import { validateDay } from '../domain/maintenance.js';

const URL = 'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles';
const REQUEST_TIMEOUT_MS = 10_000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

function dayOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const day = validateDay(value);
  return day.ok ? day.value : undefined;
}

function textOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** The DVLA's reply to the dates we use. Anything unexpected is left out rather than guessed. */
export function datesFromResponse(body: unknown): VehicleDates {
  const data = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  return {
    motExpiry: dayOf(data['motExpiryDate']),
    taxDue: dayOf(data['taxDueDate']),
    motStatus: textOf(data['motStatus']),
    taxStatus: textOf(data['taxStatus']),
  };
}

/** Registrations are sent without spaces, in capitals. */
export const normaliseRegistration = (registration: string): string =>
  registration.replace(/\s+/g, '').toUpperCase();

/**
 * The DVLA's Vehicle Enquiry Service: road tax and MOT dates by registration. Needs a key from the DVLA; the key is
 * sent as a header and never logged. `fetch` is injected for tests.
 */
export class DvlaVehicleEnquiry implements VehicleLookup {
  readonly configured = true;

  constructor(
    private readonly apiKey: string,
    private readonly doFetch: Fetch = (url, init) => fetch(url, init),
  ) {}

  async lookup(
    registration: string,
  ): Promise<Result<VehicleDates, LookupNotFound | LookupUnavailable>> {
    let response: Response;
    try {
      response = await this.doFetch(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey },
        body: JSON.stringify({ registrationNumber: normaliseRegistration(registration) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return err({ tag: 'LookupUnavailable' });
    }
    // 404: not on the record. 400: not a registration it can read. Both mean there is nothing to find.
    if (response.status === 404 || response.status === 400) return err({ tag: 'LookupNotFound' });
    if (!response.ok) return err({ tag: 'LookupUnavailable' });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return err({ tag: 'LookupUnavailable' });
    }
    return ok(datesFromResponse(body));
  }
}

/** Used until a key is set. */
export class NotConfiguredVehicleLookup implements VehicleLookup {
  readonly configured = false;

  lookup(): Promise<Result<VehicleDates, LookupNotFound | LookupUnavailable>> {
    return Promise.resolve(err({ tag: 'LookupUnavailable' }));
  }
}
