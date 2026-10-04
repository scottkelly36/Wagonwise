interface Props {
  /** Matches the field's `aria-describedby`. */
  readonly id: string;
  readonly message: string | undefined;
}

/** What is wrong with a field, shown under it. Nothing renders until there is a message. */
export function FieldError({ id, message }: Props) {
  if (message === undefined) return null;
  return (
    <p id={id} className="field-error" role="alert">
      {message}
    </p>
  );
}
