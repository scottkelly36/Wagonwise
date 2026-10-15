/** Where the staff session is kept, so it can last past the tab. "Kept on this computer" lives in `localStorage` (until the
 *  person signs out or the 7 days of the refresh token run out); otherwise it lives in `sessionStorage` and ends with the tab. */
export interface SessionStores {
  readonly local: StorageLike;
  readonly session: StorageLike;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SavedSession<T> {
  readonly session: T;
  /** True when it was found in the computer-wide store, so the next save should go back there. */
  readonly remembered: boolean;
}

/** The saved session, from the computer-wide store first, then the tab's. Anything that does not parse is ignored. */
export function loadSession<T>(stores: SessionStores, key: string): SavedSession<T> | undefined {
  for (const [store, remembered] of [
    [stores.local, true],
    [stores.session, false],
  ] as const) {
    try {
      const json = store.getItem(key);
      if (json !== null) return { session: JSON.parse(json) as T, remembered };
    } catch {
      // Storage unavailable or damaged: try the other one.
    }
  }
  return undefined;
}

/** Saves the session in one store and takes it out of the other, so it is never in both. */
export function saveSession<T>(
  stores: SessionStores,
  key: string,
  session: T,
  remembered: boolean,
): void {
  const [keep, drop] = remembered ? [stores.local, stores.session] : [stores.session, stores.local];
  try {
    keep.setItem(key, JSON.stringify(session));
  } catch {
    // Storage unavailable (private mode): the session still works for this page load.
  }
  try {
    drop.removeItem(key);
  } catch {
    // Nothing to take out.
  }
}

export function clearSession(stores: SessionStores, key: string): void {
  for (const store of [stores.local, stores.session]) {
    try {
      store.removeItem(key);
    } catch {
      // Nothing to take out.
    }
  }
}
