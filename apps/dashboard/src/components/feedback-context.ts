import { createContext, useContext } from 'react';

export interface ConfirmOptions {
  /** What will happen, in a sentence or two. */
  readonly message: string;
  /** The button that goes ahead, named for the action ("Cancel job"), never just "OK". */
  readonly confirmLabel: string;
  /** The button that backs out. Defaults to "Go back". */
  readonly cancelLabel?: string;
  /** How heavy the action is: `danger` deletes, `caution` is hard to undo, `normal` is neither. Defaults to `danger`. */
  readonly tone?: 'danger' | 'caution' | 'normal';
}

export type Ask = (options: ConfirmOptions) => Promise<boolean>;
export type Notify = (text: string) => void;

export const AskContext = createContext<Ask | undefined>(undefined);
export const NotifyContext = createContext<Notify | undefined>(undefined);

/** Ask before doing something heavy: `void ask({...}).then((ok) => { if (ok) doIt(); })`. */
export function useConfirm(): Ask {
  const ask = useContext(AskContext);
  if (ask === undefined) throw new Error('useConfirm needs a FeedbackProvider above it.');
  return ask;
}

/** Say what just happened ("Job cancelled"). It shows for a few seconds. */
export function useNotify(): Notify {
  const notify = useContext(NotifyContext);
  if (notify === undefined) throw new Error('useNotify needs a FeedbackProvider above it.');
  return notify;
}
