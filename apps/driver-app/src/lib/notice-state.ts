/**
 * A notice over the map (a break due, a faster route) takes a lot of screen, so after a few seconds it shrinks to a small flag
 * the driver can tap to open again, and can be dismissed. A new notice, or the same one when it becomes more urgent (a different
 * `key`), opens in full again.
 */
export type NoticeMode = 'open' | 'flag' | 'hidden';

export interface NoticeState {
  readonly key: string | undefined;
  readonly mode: NoticeMode;
}

export type NoticeEvent =
  | { readonly type: 'key'; readonly key: string | undefined }
  | { readonly type: 'collapse' }
  | { readonly type: 'expand' }
  | { readonly type: 'dismiss' };

export const INITIAL_NOTICE: NoticeState = { key: undefined, mode: 'hidden' };

export function noticeReducer(state: NoticeState, event: NoticeEvent): NoticeState {
  switch (event.type) {
    case 'key':
      if (event.key === state.key) return state;
      return { key: event.key, mode: event.key === undefined ? 'hidden' : 'open' };
    case 'collapse':
      return state.mode === 'open' ? { ...state, mode: 'flag' } : state;
    case 'expand':
      return state.mode === 'flag' ? { ...state, mode: 'open' } : state;
    case 'dismiss':
      return state.mode === 'hidden' ? state : { ...state, mode: 'hidden' };
  }
}
