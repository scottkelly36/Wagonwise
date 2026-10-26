import { useState } from 'react';

import { useWords } from '../hooks/use-words';
import { wordsKey, wordsLookupMessage } from '../lib/words';
import { FieldError } from './FieldError';

/**
 * Three words (what3words) for a stop: type them and press Find, and the spot is shown with the nearest town so a mistyped word
 * that lands in the wrong county is plain to see before the driver is sent there. Nothing is looked up as the person types: each
 * lookup is billed, so it is one press, one lookup.
 */
export function WordsField({
  id,
  value,
  onChange,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** A problem found on submit; shown in place of the lookup's hint. */
  error: string | undefined;
}) {
  const [searched, setSearched] = useState<string | undefined>(undefined);
  const lookup = useWords(searched);
  // The answer only counts while the box still says what Find was pressed with.
  const current = searched !== undefined && wordsKey(searched) === wordsKey(value);
  const canFind = wordsKey(value) !== undefined && !lookup.isFetching;

  let hint: { text: string; color: string } | undefined;
  if (current && lookup.isFetching) hint = { text: 'Looking up…', color: 'var(--text-muted)' };
  else if (current && lookup.data !== undefined) {
    hint = {
      text: `✓ ///${lookup.data.words}${lookup.data.nearestPlace === undefined ? '' : `, near ${lookup.data.nearestPlace}`}`,
      color: 'var(--success)',
    };
  } else if (current && lookup.error !== null) {
    hint = { text: wordsLookupMessage(lookup.error), color: 'var(--danger)' };
  }

  return (
    <div className="field">
      <label htmlFor={id}>Three words</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (canFind) setSearched(value);
            }
          }}
          placeholder="e.g. filled.count.soap"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          style={{ flex: 1 }}
          aria-invalid={error !== undefined}
          aria-describedby={`${id}-note`}
        />
        <button
          type="button"
          className="secondary"
          disabled={!canFind}
          onClick={() => setSearched(value)}
        >
          Find
        </button>
      </div>
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
