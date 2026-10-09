interface Props {
  readonly title: string;
  readonly note: string;
}

/** Every real page in this app starts as one of these until its backend is designed — see
 *  `pages/SignIn.tsx`'s comment for why nothing here calls core yet. */
export function Placeholder({ title, note }: Props) {
  return (
    <div>
      <h1>{title}</h1>
      <p style={{ color: 'var(--text-muted)' }}>{note}</p>
    </div>
  );
}
