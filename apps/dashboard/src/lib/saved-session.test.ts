import { describe, expect, it } from 'vitest';
import {
  clearSession,
  loadSession,
  saveSession,
  type SessionStores,
  type StorageLike,
} from './saved-session';

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const KEY = 'k';
const stores = (): SessionStores & {
  local: ReturnType<typeof memory>;
  session: ReturnType<typeof memory>;
} => ({
  local: memory(),
  session: memory(),
});

describe('saved session', () => {
  it('keeps a remembered session on the computer only, and a tab one in the tab only', () => {
    const s = stores();
    saveSession(s, KEY, { a: 1 }, true);
    expect([s.local.data.has(KEY), s.session.data.has(KEY)]).toEqual([true, false]);
    saveSession(s, KEY, { a: 2 }, false);
    expect([s.local.data.has(KEY), s.session.data.has(KEY)]).toEqual([false, true]);
  });

  it('loads from either, saying which, and prefers the computer-wide one', () => {
    const s = stores();
    expect(loadSession(s, KEY)).toBeUndefined();
    s.session.setItem(KEY, JSON.stringify({ a: 'tab' }));
    expect(loadSession(s, KEY)).toEqual({ session: { a: 'tab' }, remembered: false });
    s.local.setItem(KEY, JSON.stringify({ a: 'computer' }));
    expect(loadSession(s, KEY)).toEqual({ session: { a: 'computer' }, remembered: true });
  });

  it('ignores a damaged entry and falls back to the other store', () => {
    const s = stores();
    s.local.setItem(KEY, '{not json');
    s.session.setItem(KEY, JSON.stringify({ a: 1 }));
    expect(loadSession(s, KEY)).toEqual({ session: { a: 1 }, remembered: false });
  });

  it('clears both', () => {
    const s = stores();
    s.local.setItem(KEY, '1');
    s.session.setItem(KEY, '1');
    clearSession(s, KEY);
    expect([s.local.data.size, s.session.data.size]).toEqual([0, 0]);
  });
});
