import {
  PARKING_FACILITIES,
  type ParkingFacility,
  type ParkingKind,
  type ParkingSource,
  type SafeParkingSpotDto,
  type SaveParkingSpotRequest,
} from '@wagonwise/contracts/parking';

export const FACILITY_LABELS: Record<ParkingFacility, string> = {
  paid: 'Paid parking',
  toilets: 'Toilets',
  showers: 'Showers',
  shop: 'Shop',
  food: 'Food',
  fuel: 'Fuel',
  lit: 'Lit at night',
  secure: 'Secure or supervised',
};

export const SOURCE_LABELS: Record<ParkingSource, string> = {
  driver: 'Reported by a driver',
  admin: 'Added by WagonWise',
  osm: 'OpenStreetMap',
};

export const sourceOf = (spot: Pick<SafeParkingSpotDto, 'source'>): ParkingSource =>
  spot.source ?? 'driver';

/** "Paid, toilets, showers" for what is known to be there; "Free" when it is known to cost nothing. */
export function facilitiesSummary(spot: SafeParkingSpotDto): string {
  const parts: string[] = [];
  if (spot.paid === true) parts.push('Paid');
  if (spot.paid === false) parts.push('Free');
  for (const key of PARKING_FACILITIES) {
    if (key !== 'paid' && spot[key] === true) parts.push(FACILITY_LABELS[key]);
  }
  return parts.join(', ');
}

/**
 * A place as "51.5074, -0.1278" (what you get when you copy a point from a map), or the two numbers separated by a space.
 * `undefined` when it is not two sensible numbers.
 */
export function parseLatLon(text: string): { lat: number; lon: number } | undefined {
  const parts = text
    .trim()
    .split(/[\s,;]+/)
    .filter((p) => p !== '');
  if (parts.length !== 2) return undefined;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return undefined;
  return { lat, lon };
}

export type Known = 'unknown' | 'yes' | 'no';

export const KIND_LABELS: Record<ParkingKind, string> = {
  parking: 'Parking (lorry park, truck stop, service area)',
  layby: 'Lay-by (not checked for lorries)',
};

export interface SpotForm {
  kind: ParkingKind;
  location: string;
  name: string;
  note: string;
  capacity: string;
  facilities: Record<ParkingFacility, Known>;
}

export const emptyForm = (): SpotForm => ({
  kind: 'parking',
  location: '',
  name: '',
  note: '',
  capacity: '',
  facilities: Object.fromEntries(PARKING_FACILITIES.map((f) => [f, 'unknown'])) as Record<
    ParkingFacility,
    Known
  >,
});

const toKnown = (value: boolean | undefined): Known =>
  value === undefined ? 'unknown' : value ? 'yes' : 'no';

export function spotToForm(spot: SafeParkingSpotDto): SpotForm {
  const form = emptyForm();
  for (const key of PARKING_FACILITIES) form.facilities[key] = toKnown(spot[key]);
  return {
    ...form,
    kind: spot.kind ?? 'parking',
    location: `${spot.location.lat}, ${spot.location.lon}`,
    name: spot.name ?? '',
    note: spot.note ?? '',
    capacity: spot.capacity === undefined ? '' : String(spot.capacity),
  };
}

/** The request for a filled-in form, or what is wrong with it. */
export function formToRequest(
  form: SpotForm,
): { ok: true; request: SaveParkingSpotRequest } | { ok: false; problem: string } {
  const location = parseLatLon(form.location);
  if (location === undefined) {
    return { ok: false, problem: 'Enter the place as two numbers, like 51.5074, -0.1278.' };
  }
  const capacityText = form.capacity.trim();
  const capacity = capacityText === '' ? undefined : Number(capacityText);
  if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 0 || capacity > 5000)) {
    return { ok: false, problem: 'Spaces should be a whole number, or left empty.' };
  }
  const request: SaveParkingSpotRequest = { location, kind: form.kind };
  if (form.name.trim() !== '') request.name = form.name.trim();
  if (form.note.trim() !== '') request.note = form.note.trim();
  if (capacity !== undefined) request.capacity = capacity;
  for (const key of PARKING_FACILITIES) {
    const known = form.facilities[key];
    if (known !== 'unknown') request[key] = known === 'yes';
  }
  return { ok: true, request };
}
