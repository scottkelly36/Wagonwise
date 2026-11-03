import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AskContext,
  NotifyContext,
  type Ask,
  type ConfirmOptions,
  type Notify,
} from './feedback-context';

interface Pending extends ConfirmOptions {
  readonly resolve: (ok: boolean) => void;
}

interface Toast {
  readonly id: number;
  readonly text: string;
}

const TOAST_MS = 5000;

/**
 * In-page replacements for the browser's `confirm` and for "did that work?": a modal question that names the action on its
 * button, and a short message that says what happened. Wrap the signed-in pages in this once; pages call {@link useConfirm}
 * and {@link useNotify}.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | undefined>(undefined);
  const pendingRef = useRef<Pending | undefined>(undefined);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const nextId = useRef(1);

  const ask = useCallback<Ask>((options) => {
    // A second question while one is open backs out of the first.
    pendingRef.current?.resolve(false);
    return new Promise<boolean>((resolve) => {
      const next = { ...options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (pending !== undefined && dialog !== null && !dialog.open) dialog.showModal();
  }, [pending]);

  const settle = (ok: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = undefined;
    setPending(undefined);
    current?.resolve(ok);
  };

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback<Notify>(
    (text) => {
      const id = nextId.current++;
      setToasts((all) => [...all, { id, text }]);
      window.setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  const tone = pending?.tone ?? 'danger';
  const toneClass =
    tone === 'danger' ? 'btn-danger' : tone === 'caution' ? 'btn-caution' : 'btn-primary';

  return (
    <AskContext.Provider value={ask}>
      <NotifyContext.Provider value={notify}>
        {children}
        {pending !== undefined && (
          <dialog
            ref={dialogRef}
            className="confirm-dialog"
            aria-labelledby="confirm-message"
            // Escape, or a click on the dim area around the box, backs out.
            onCancel={(event) => {
              event.preventDefault();
              settle(false);
            }}
            onClick={(event) => {
              if (event.target === dialogRef.current) settle(false);
            }}
          >
            <p id="confirm-message" className="confirm-message">
              {pending.message}
            </p>
            <div className="confirm-actions">
              {/* Backing out holds the focus, so a stray Enter never does the heavy thing. */}
              <button type="button" autoFocus onClick={() => settle(false)}>
                {pending.cancelLabel ?? 'Go back'}
              </button>
              <button type="button" className={toneClass} onClick={() => settle(true)}>
                {pending.confirmLabel}
              </button>
            </div>
          </dialog>
        )}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className="toast">
              <span>{toast.text}</span>
              <button
                type="button"
                className="toast-close"
                aria-label="Dismiss message"
                onClick={() => dismiss(toast.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </NotifyContext.Provider>
    </AskContext.Provider>
  );
}
