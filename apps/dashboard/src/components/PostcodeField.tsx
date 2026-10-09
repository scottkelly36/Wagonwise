import { type UseQueryResult } from '@tanstack/react-query';

import { PostcodeNotFoundError, type ResolvedPostcode } from '../lib/postcodes';
import { FieldError } from './FieldError';

/** A postcode box with the place it resolves to underneath, so a typo that happens to be another
 *  real postcode ("NE46" vs "NE45") is caught by the dispatcher before the driver is sent there. */
export function PostcodeField({
  id,
  label,
  value,
  onChange,
  lookup,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  lookup: UseQueryResult<ResolvedPostcode>;
  /** A problem found on submit; shown in place of the live lookup's hint. */
  error: string | undefined;
}) {
  let hint: { text: string; color: string } | undefined;
  if (lookup.isFetching) {
    hint = { text: 'Looking up…', color: 'var(--text-muted)' };
  } else if (lookup.data !== undefined) {
    hint = { text: `✓ ${lookup.data.place}`, color: 'var(--success)' };
  } else if (lookup.error instanceof PostcodeNotFoundError) {
    hint = { text: "Can't find that postcode", color: 'var(--danger)' };
  } else if (lookup.error !== null) {
    hint = { text: "Couldn't check it just now", color: 'var(--warning)' };
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. NE46 3JA"
        autoComplete="off"
        style={{ textTransform: 'uppercase' }}
        aria-invalid={error !== undefined}
        aria-describedby={`${id}-note`}
      />
      {/* One fixed-height line under the field, so a lookup result never moves what is below it. */}
      <div className="field-note" id={`${id}-note`}>
        {error !== undefined ? (
          <FieldError id={`${id}-error`} message={error} />
        ) : (
          <small style={{ color: hint?.color }}>{hint?.text}</small>
        )}
      </div>
    </div>
  );
}
