import { useEffect, useState } from 'react';

/** The value as it was `delayMs` after it last changed: a map being panned asks the server once it stops, not at every frame. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [held, setHeld] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setHeld(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return held;
}
