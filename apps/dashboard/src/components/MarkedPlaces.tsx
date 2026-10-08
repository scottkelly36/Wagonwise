import type { SavedPlaceDto } from '@wagonwise/contracts/places';
import { milesText, PLACE_CATEGORY_LABELS, placesNearPoint } from '../lib/places';

interface Props {
  /** Every place the company has marked. */
  readonly places: readonly SavedPlaceDto[];
  /** Where the typed postcode landed, once it has been looked up. */
  readonly near: { readonly lat: number; readonly lon: number } | undefined;
  /** The place chosen for this stop, if any. */
  readonly chosen: SavedPlaceDto | undefined;
  readonly onChoose: (place: SavedPlaceDto | undefined) => void;
}

/**
 * Under a stop's postcode on the job form: entrances a driver has already marked near it. A rural
 * postcode lands where the postcode centre is, often not the gate; choosing a marked place sends the
 * driver to the real entrance and carries its note onto the stop.
 */
export function MarkedPlaces({ places, near, chosen, onChoose }: Props) {
  if (chosen !== undefined) {
    return (
      <p className="marked-places" data-testid="marked-place-chosen">
        Using the marked entrance <strong>{chosen.name}</strong>
        {chosen.note !== undefined && <> ({chosen.note})</>}.{' '}
        <button type="button" className="link-button" onClick={() => onChoose(undefined)}>
          Use the postcode instead
        </button>
      </p>
    );
  }
  if (near === undefined) return null;
  const found = placesNearPoint(places, near);
  if (found.length === 0) return null;
  return (
    <div className="marked-places" data-testid="marked-places">
      <small className="muted">Marked by your drivers near this postcode:</small>
      <ul>
        {found.map(({ place, distanceM }) => (
          <li key={place.id}>
            <button type="button" className="link-button" onClick={() => onChoose(place)}>
              Use {place.name}
            </button>{' '}
            <small className="muted">
              ({PLACE_CATEGORY_LABELS[place.category]}, {milesText(distanceM)} from the postcode
              {place.note !== undefined ? `: ${place.note}` : ''})
            </small>
          </li>
        ))}
      </ul>
    </div>
  );
}
