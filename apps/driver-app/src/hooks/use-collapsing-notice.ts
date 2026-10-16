import { useCallback, useEffect, useReducer, useRef } from 'react';

import { INITIAL_NOTICE, noticeReducer, type NoticeMode } from '../lib/notice-state';

export interface CollapsingNotice {
  readonly mode: NoticeMode;
  readonly expand: () => void;
  readonly dismiss: () => void;
}

/**
 * The open / flag / hidden state of one notice (`lib/notice-state.ts`), with the timer that shrinks it. `noticeKey` is undefined
 * when there is nothing to say; a new key opens the notice in full and calls `onAppear` once (the vibration and spoken cue), so a
 * notice that merely redraws does not nag. After `autoCollapseMs` open, it shrinks to a flag.
 */
export function useCollapsingNotice(
  noticeKey: string | undefined,
  options: { readonly autoCollapseMs: number; readonly onAppear?: () => void },
): CollapsingNotice {
  const [state, dispatch] = useReducer(noticeReducer, INITIAL_NOTICE);

  // The latest callback, so a new function each render does not restart anything.
  const onAppear = useRef(options.onAppear);
  useEffect(() => {
    onAppear.current = options.onAppear;
  });

  useEffect(() => {
    dispatch({ type: 'key', key: noticeKey });
    if (noticeKey !== undefined) onAppear.current?.();
  }, [noticeKey]);

  useEffect(() => {
    if (state.mode !== 'open') return;
    const timer = setTimeout(() => dispatch({ type: 'collapse' }), options.autoCollapseMs);
    return () => clearTimeout(timer);
  }, [state.mode, state.key, options.autoCollapseMs]);

  const expand = useCallback(() => dispatch({ type: 'expand' }), []);
  const dismiss = useCallback(() => dispatch({ type: 'dismiss' }), []);

  // Before the first effect has run the reducer is still at its start; show nothing until it has caught up with the key.
  const mode: NoticeMode =
    noticeKey === undefined || state.key !== noticeKey ? 'hidden' : state.mode;
  return { mode, expand, dismiss };
}
