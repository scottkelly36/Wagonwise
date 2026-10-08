import type { SavedPlaceDto } from '@wagonwise/contracts/places';

import { usePostcode } from '../hooks/use-postcode';
import {
  effectiveSource,
  stopProblems,
  type StopDraft,
  type StopKind,
  type StopSource,
} from '../lib/job-stops';
import { FieldError } from './FieldError';
import { MarkedPlaces } from './MarkedPlaces';
import { PostcodeField } from './PostcodeField';
import { SavedLocationPicker } from './SavedLocationPicker';
import { Seg } from './Seg';

const KINDS = [
  { key: 'pickup', label: 'Collect' },
  { key: 'delivery', label: 'Deliver' },
] as const;
const SOURCES = [
  { key: 'saved', label: 'Stored location' },
  { key: 'new', label: 'New address' },
] as const;

interface Props {
  readonly index: number;
  readonly count: number;
  readonly stop: StopDraft;
  /** Every location the company has stored (marked by drivers or added on the Places page). */
  readonly places: readonly SavedPlaceDto[];
  readonly showErrors: boolean;
  readonly onChange: (stop: StopDraft) => void;
  readonly onMove: (direction: -1 | 1) => void;
  readonly onRemove: () => void;
}

/**
 * One stop on the job form: a collection or a delivery, from a stored location or a new address. The driver
 * works down the list in the order it is shown.
 */
export function StopEditor({
  index,
  count,
  stop,
  places,
  showErrors,
  onChange,
  onMove,
  onRemove,
}: Props) {
  const source = effectiveSource(stop, places.length);
  const lookup = usePostcode(stop.postcode);
  const problems = showErrors ? stopProblems(stop, places.length) : {};
  const id = `job-stop-${stop.key}`;
  const set = (patch: Partial<StopDraft>) => onChange({ ...stop, ...patch });

  return (
    <div className="stop-editor" data-testid={`stop-${index}`}>
      <div className="stop-editor-head">
        <span className="stop-number" aria-hidden="true">
          {index + 1}
        </span>
        <Seg
          ariaLabel={`Stop ${index + 1} type`}
          value={stop.kind}
          options={KINDS}
          onChange={(kind: StopKind) => set({ kind })}
        />
        <Seg
          ariaLabel={`Stop ${index + 1} location`}
          value={source}
          options={SOURCES}
          onChange={(next: StopSource) => set({ source: next, place: undefined })}
        />
        <span className="stop-editor-buttons">
          <button
            type="button"
            className="secondary"
            aria-label={`Move stop ${index + 1} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="secondary"
            aria-label={`Move stop ${index + 1} down`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="secondary"
            aria-label={`Remove stop ${index + 1}`}
            disabled={count === 1}
            onClick={onRemove}
          >
            ×
          </button>
        </span>
      </div>

      {source === 'saved' ? (
        <SavedLocationPicker
          id={`${id}-saved`}
          label="Stored location"
          places={places}
          chosen={stop.place}
          onChoose={(place) => set({ place })}
          error={problems.place}
        />
      ) : (
        <div className="job-form">
          <div className="field">
            <label htmlFor={`${id}-name`}>Name</label>
            <input
              id={`${id}-name`}
              value={stop.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder={stop.kind === 'pickup' ? 'e.g. Hexham Quarry' : 'e.g. Hebburn depot'}
              aria-invalid={problems.name !== undefined}
              aria-describedby={`${id}-name-error`}
            />
            <FieldError id={`${id}-name-error`} message={problems.name} />
          </div>
          <PostcodeField
            id={`${id}-postcode`}
            label="Postcode"
            value={stop.postcode}
            onChange={(postcode) => set({ postcode })}
            lookup={lookup}
            error={problems.postcode}
          />
          <MarkedPlaces
            places={places}
            near={lookup.data?.location}
            chosen={stop.place}
            onChoose={(place) => set({ place })}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={stop.save}
              onChange={(e) => set({ save: e.target.checked })}
            />
            Save this location for next time
          </label>
        </div>
      )}
    </div>
  );
}
