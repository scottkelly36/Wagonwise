import {
  PARKING_FACILITIES,
  type ParkingFacility,
  type SafeParkingSpotDto,
  type SuggestParkingSpotEditRequest,
} from '@wagonwise/contracts/parking';

export const FACILITY_WORDS: Record<ParkingFacility, string> = {
  paid: 'Paid parking',
  toilets: 'Toilets',
  showers: 'Showers',
  shop: 'Shop',
  food: 'Food',
  fuel: 'Fuel',
  lit: 'Lit at night',
  secure: 'Secure',
};

/** What the driver has typed or picked. A facility left undefined is "not sure", which is how it starts if nobody has said. */
export interface SuggestionForm {
  readonly name: string;
  readonly spaces: string;
  readonly note: string;
  readonly facilities: Readonly<Record<ParkingFacility, boolean | undefined>>;
}

export function formFromSpot(spot: SafeParkingSpotDto): SuggestionForm {
  return {
    name: spot.name ?? '',
    spaces: spot.capacity === undefined ? '' : String(spot.capacity),
    note: spot.note ?? '',
    facilities: Object.fromEntries(PARKING_FACILITIES.map((key) => [key, spot[key]])) as Record<
      ParkingFacility,
      boolean | undefined
    >,
  };
}

/** Tapping a facility: not sure becomes yes, then it flips between yes and no. */
export function nextFacility(value: boolean | undefined): boolean {
  return value === undefined ? true : !value;
}

export type BuiltSuggestion =
  | { readonly ok: true; readonly request: SuggestParkingSpotEditRequest }
  | { readonly ok: false; readonly problem: string };

/** Only what the driver changed is sent. Nothing changed is not a suggestion. */
export function buildSuggestion(spot: SafeParkingSpotDto, form: SuggestionForm): BuiltSuggestion {
  const request: {
    name?: string;
    note?: string;
    capacity?: number;
  } & Partial<Record<ParkingFacility, boolean>> = {};

  const name = form.name.trim();
  if (name !== '' && name !== (spot.name ?? '')) request.name = name;
  const note = form.note.trim();
  if (note !== '' && note !== (spot.note ?? '')) request.note = note;

  const spaces = form.spaces.trim();
  if (spaces !== '') {
    if (!/^\d{1,4}$/.test(spaces)) {
      return { ok: false, problem: 'Spaces should be a whole number, like 12.' };
    }
    const capacity = Number(spaces);
    if (capacity !== spot.capacity) request.capacity = capacity;
  }

  for (const key of PARKING_FACILITIES) {
    const value = form.facilities[key];
    if (value !== undefined && value !== spot[key]) request[key] = value;
  }

  if (Object.keys(request).length === 0) {
    return { ok: false, problem: 'Change something first, then send.' };
  }
  return { ok: true, request };
}
