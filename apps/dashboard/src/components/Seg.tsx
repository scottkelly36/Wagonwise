interface Props<T extends string> {
  readonly options: readonly { readonly key: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (key: T) => void;
  readonly ariaLabel: string;
}

/** A small split button: the choices share a track and the chosen one is filled. */
export function Seg<T extends string>({ options, value, onChange, ariaLabel }: Props<T>) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className={option.key === value ? 'on' : undefined}
          aria-pressed={option.key === value}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
