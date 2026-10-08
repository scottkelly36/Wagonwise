import type { SavedPlaceDto } from '@wagonwise/contracts/places';

import { PLACE_CATEGORY_LABELS } from '../lib/places';
import { FieldError } from './FieldError';

interface Props {
  readonly id: string;
  readonly label: string;
  /** Every location the company has stored (marked by drivers or added on the Places page). */
  readonly places: readonly SavedPlaceDto[];
  readonly chosen: SavedPlaceDto | undefined;
  readonly onChoose: (place: SavedPlaceDto | undefined) => void;
  readonly error: string | undefined;
}

/** Choose one of the company's stored locations for a stop. It supplies the name, the map point and any note
 *  for the driver, so they go to the right gate every time. */
export function SavedLocationPicker({ id, label, places, chosen, onChoose, error }: Props) {
  const sorted = [...places].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={chosen?.id ?? ''}
        onChange={(e) => onChoose(places.find((p) => p.id === e.target.value))}
        aria-invalid={error !== undefined}
        aria-describedby={`${id}-note`}
      >
        <option value="">
          {sorted.length === 0 ? 'No stored locations yet' : 'Choose a location…'}
        </option>
        {sorted.map((place) => (
          <option key={place.id} value={place.id}>
            {place.name} ({PLACE_CATEGORY_LABELS[place.category]})
          </option>
        ))}
      </select>
      <div className="field-note" id={`${id}-note`}>
        {error !== undefined ? (
          <FieldError id={`${id}-error`} message={error} />
        ) : chosen === undefined ? (
          sorted.length === 0 ? (
            <small className="muted">Add them on the Places page, or choose New address.</small>
          ) : null
        ) : (
          <small className="muted">
            {chosen.note === undefined
              ? 'No note on this location.'
              : `Note for the driver: ${chosen.note}`}
          </small>
        )}
      </div>
    </div>
  );
}
