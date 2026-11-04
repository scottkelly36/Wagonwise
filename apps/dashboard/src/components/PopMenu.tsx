import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/**
 * A button that opens a menu, the standard way: Enter, Space or the Down arrow opens it and lands on the first item; the
 * arrow keys, Home and End move between items; Escape closes it and puts focus back on the button; Tab or a click outside
 * closes it; choosing an item closes it. Items are anything with `role="menuitem"` (a link or a button, `tabIndex={-1}`),
 * and `header` is plain text above them that is not part of the menu (who is signed in, "nothing needs you").
 */
export function PopMenu({
  label,
  trigger,
  header,
  className,
  triggerClassName,
  children,
}: {
  /** What the button is called for a screen reader. */
  label: string;
  /** What the button shows. */
  trigger: ReactNode;
  header?: ReactNode;
  className?: string;
  triggerClassName?: string;
  /** The menu's items; leave empty to show only the header. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = (): HTMLElement[] =>
    Array.from(panel.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) button.current?.focus();
  };

  // Opening moves focus to the first item (or to the panel when there are none, so Escape still works from inside it).
  useEffect(() => {
    if (!open) return;
    (items()[0] ?? panel.current)?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (root.current !== null && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const onPanelKey = (event: KeyboardEvent) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => {
      event.preventDefault();
      list[(i + list.length) % list.length]?.focus();
    };
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      case 'ArrowDown':
        if (list.length > 0) go(at + 1);
        break;
      case 'ArrowUp':
        if (list.length > 0) go(at < 0 ? -1 : at - 1);
        break;
      case 'Home':
        if (list.length > 0) go(0);
        break;
      case 'End':
        if (list.length > 0) go(list.length - 1);
        break;
    }
  };

  return (
    <div className={className === undefined ? 'popmenu' : `popmenu ${className}`} ref={root}>
      <button
        type="button"
        ref={button}
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          className="popmenu-panel"
          ref={panel}
          tabIndex={-1}
          onKeyDown={onPanelKey}
          onClick={(event) => {
            // Choosing an item closes the menu; a click on the header text does not.
            if ((event.target as HTMLElement).closest('[role="menuitem"]') !== null) setOpen(false);
          }}
        >
          {header !== undefined && <div className="popmenu-header">{header}</div>}
          {children !== undefined && (
            <div id={menuId} role="menu" aria-label={label}>
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
