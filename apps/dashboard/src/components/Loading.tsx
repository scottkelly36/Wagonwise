/** What shows while a page's data is on its way: grey bars where text will be, and "Loading" for a screen reader. */
export function Loading({ lines = 3 }: { lines?: number }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className="loading-bar"
          aria-hidden="true"
          style={{ width: `${92 - i * 18}%` }}
        />
      ))}
    </div>
  );
}
