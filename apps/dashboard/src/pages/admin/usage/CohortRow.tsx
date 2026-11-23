/** One line of the new-drivers table: a day, how many joined, and the share who chose a vehicle, planned a route and started a trip. */
export function CohortRow({
  cells,
  header = false,
  title,
  compact = false,
}: {
  cells: readonly string[];
  header?: boolean;
  title?: string;
  /** Smaller type and a narrower first column, for a table with many columns on a phone. */
  compact?: boolean;
}) {
  return (
    <div
      role="row"
      title={title}
      style={{
        display: 'flex',
        gap: 8,
        padding: '5px 0',
        borderTop: header ? undefined : '1px solid var(--line, rgba(128,128,128,0.2))',
        fontSize: header || compact ? 12 : 14,
        fontVariantNumeric: 'tabular-nums',
        opacity: header ? 0.7 : 1,
      }}
    >
      {cells.map((cell, i) => (
        <span
          key={`${i}-${cell}`}
          role={header ? 'columnheader' : 'cell'}
          style={{
            flex: i === 0 ? `0 0 ${compact ? 56 : 92}px` : 1,
            minWidth: 0,
            textAlign: i === 0 ? 'left' : 'right',
          }}
        >
          {cell}
        </span>
      ))}
    </div>
  );
}
