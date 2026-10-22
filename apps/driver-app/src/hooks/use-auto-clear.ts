import { useEffect, useRef } from 'react';

/**
 * Calls `clear` once `delayMs` after `active` turns on, and not at all if it turns off (or `resetKey` changes) first. For a
 * result shown on the map ("Traffic reported.", an error): it says its piece and then goes, instead of sitting there until
 * the next report.
 */
export function useAutoClear(
  active: boolean,
  delayMs: number,
  clear: () => void,
  resetKey?: string,
): void {
  const clearRef = useRef(clear);
  useEffect(() => {
    clearRef.current = clear;
  });

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => clearRef.current(), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs, resetKey]);
}
