// Postcode → map point for the Jobs form. A dispatcher knows a depot's postcode, not its latitude
// and longitude. postcodes.io is free, needs no key and is CORS-enabled, so — like the driver
// app's MapTiler address search — the browser calls it directly rather than adding a server round
// trip for a read of public data. A postcode resolves to the centre of its few dozen addresses,
// which is plenty to route a lorry to a yard; it is not a gate-level pin.

export interface ResolvedPostcode {
  /** Canonical form, e.g. "NE46 3LR". */
  readonly postcode: string;
  /** Plain words for confirming it's the right place, e.g. "Hexham, Northumberland". */
  readonly place: string;
  readonly location: { readonly lat: number; readonly lon: number };
}

export class PostcodeNotFoundError extends Error {
  constructor(readonly postcode: string) {
    super(`Postcode not found: ${postcode}`);
    this.name = 'PostcodeNotFoundError';
  }
}

// The standard outward/inward shape (A9, A99, A9A, AA9, AA99, AA9A + 9AA). Deliberately only a
// shape check — whether it exists is postcodes.io's call, and a regex that tried to know every
// valid area letter would be wrong the first time Royal Mail adds one.
const POSTCODE_SHAPE = /^([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})$/;

/** Upper-cased, correctly spaced postcode, or `undefined` if the text isn't shaped like one yet
 *  (so a lookup isn't fired on every keystroke). */
export function normalisePostcode(input: string): string | undefined {
  const match = POSTCODE_SHAPE.exec(input.trim().toUpperCase());
  return match === null ? undefined : `${match[1]} ${match[2]}`;
}

interface PostcodesIoResult {
  readonly postcode?: unknown;
  readonly latitude?: unknown;
  readonly longitude?: unknown;
  readonly parish?: unknown;
  readonly admin_district?: unknown;
  readonly admin_county?: unknown;
  readonly region?: unknown;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Maps postcodes.io's `{ status, result }` body to a `ResolvedPostcode`, or `undefined` when the
 *  postcode has no usable point (a handful, e.g. some non-geographic ones, come back with null
 *  coordinates). */
export function parsePostcodeResponse(body: unknown): ResolvedPostcode | undefined {
  const result = (body as { result?: PostcodesIoResult | null } | null)?.result;
  if (result === undefined || result === null) return undefined;
  const { postcode, latitude, longitude } = result;
  if (
    typeof postcode !== 'string' ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number'
  ) {
    return undefined;
  }
  // Town-level is enough to tell "that's the right Hexham" from a typo that landed elsewhere.
  // postcodes.io fills `parish` with the placeholder "<District>, unparished area" for towns that
  // have no parish, which is noise here.
  const names: string[] = [];
  for (const name of [
    text(result.parish),
    text(result.admin_district),
    text(result.admin_county),
  ]) {
    if (name === undefined || /unparished area/i.test(name)) continue;
    if (!names.some((existing) => existing.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  const place = names.slice(0, 2).join(', ');
  return {
    postcode,
    place: place === '' ? (text(result.region) ?? 'United Kingdom') : place,
    location: { lat: latitude, lon: longitude },
  };
}

/** Looks a normalised postcode up. Throws `PostcodeNotFoundError` for one that doesn't exist, and
 *  a plain `Error` if postcodes.io can't be reached, so the caller can tell the two apart. */
export async function lookupPostcode(
  postcode: string,
  fetchFn: typeof fetch = fetch,
): Promise<ResolvedPostcode> {
  const response = await fetchFn(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`,
  );
  if (response.status === 404) throw new PostcodeNotFoundError(postcode);
  if (!response.ok) throw new Error(`postcodes.io returned ${response.status}`);
  const resolved = parsePostcodeResponse(await response.json());
  if (resolved === undefined) throw new PostcodeNotFoundError(postcode);
  return resolved;
}
