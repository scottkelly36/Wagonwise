import type { ReactNode } from 'react';

export type BadgeTone = 'danger' | 'warning' | 'ok' | 'info' | 'neutral';

/** A small label for a state. Always carries words, and an icon where there is one, so colour is never the only signal. */
export function Badge({
  tone,
  icon,
  children,
}: {
  tone: BadgeTone;
  icon?: BadgeIcon;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {icon !== undefined && <Icon name={icon} />}
      {children}
    </span>
  );
}

export type BadgeIcon = 'stop' | 'warning' | 'tick';

const PATHS: Record<BadgeIcon, ReactNode> = {
  // A stop sign: the octagon with a bar across it.
  stop: (
    <>
      <path d="M5 1.5h6L14.5 5v6L11 14.5H5L1.5 11V5z" fill="currentColor" />
      <path d="M4.5 8h7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  // A warning triangle with an exclamation mark.
  warning: (
    <>
      <path d="M8 1.5 15 14H1z" fill="currentColor" strokeLinejoin="round" />
      <path d="M8 6v4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r="0.95" fill="#fff" />
    </>
  ),
  // A tick in a circle.
  tick: (
    <>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path
        d="m4.8 8.2 2.2 2.2 4.2-4.6"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  ),
};

function Icon({ name }: { name: BadgeIcon }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
