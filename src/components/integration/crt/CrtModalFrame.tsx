/**
 * @file CrtModalFrame.tsx
 * @component CrtModalFrame
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * What the shared Modal does not do, added around it without changing it, for the windows of the cross
 * reference table screen (Keyboard shortcuts, the conflict prompt, the shared save confirmation). The
 * shared Modal renders in place (no portal to document.body), so its styles, theme tokens and the host's
 * modal offset all apply inside the plugin's shadow root. Its dialog element has no name, cannot take
 * focus and does nothing with the keyboard, so the frame adds:
 *  - an accessible name (`label`) and the ability to take focus;
 *  - focus moves into the window when it opens (`initialFocus` picks the element, the dialog itself when it
 *    picks none) and goes back when it closes, to the element that had it, or, when that element is gone,
 *    to `fallbackFocus`. `focusKey` places focus again when it changes while the window stays open (the
 *    stages of a window that changes its content);
 *  - Tab and Shift+Tab stay inside the window, wrapping from its last control to its first, so a key can
 *    never reach the table behind it;
 *  - Escape calls `onClose` and is stopped, so it never also leaves full screen. A window that cannot be
 *    closed (no `onClose`) swallows it. Every other key is kept from the table and the host page too
 *    (inside a shadow root nothing shields them);
 *  - with `closeOnBackdrop`, a click on the backdrop closes it, unless the press started inside the window
 *    (selecting text and letting go outside is not a click on the backdrop).
 *
 * The frame is mounted only while its window is open, so its effects pair with opening and closing.
 */

import { useEffect, useRef } from 'react';

export interface CrtModalFrameProps {
  /** The accessible name of the window. */
  label: string;
  /** Escape (and the backdrop, with `closeOnBackdrop`) call this. Leave it out for a window that cannot be closed. */
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  /** Where focus goes on close when the element that had it before is gone (for example the table). */
  fallbackFocus?: () => HTMLElement | null;
  /** The element that takes focus when the window opens, or null for the dialog itself. */
  initialFocus?: (dialog: HTMLElement) => HTMLElement | null;
  /** When this changes while the window is open, focus is placed again with `initialFocus`. */
  focusKey?: string | number;
  /** The shared Modal. */
  children: React.ReactNode;
}

/** What Tab can reach inside the window. The dialog element itself (tabindex -1) is left out. */
export const MODAL_FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** The focused element of the tree a node is in. Inside a shadow root document.activeElement is only the host. */
function activeElementOf(node: Node): Element | null {
  const root = node.getRootNode();
  return root instanceof Document || root instanceof ShadowRoot ? root.activeElement : null;
}

const CrtModalFrame: React.FC<CrtModalFrameProps> = ({
  label,
  onClose,
  closeOnBackdrop = false,
  fallbackFocus,
  initialFocus,
  focusKey,
  children,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pressedOnBackdrop = useRef(false);
  // Read when the window opens or closes, so a parent that rebuilds the callbacks every render is fine.
  const fallbackRef = useRef(fallbackFocus);
  const initialRef = useRef(initialFocus);
  useEffect(() => {
    fallbackRef.current = fallbackFocus;
    initialRef.current = initialFocus;
  });

  const dialogEl = (): HTMLElement | null =>
    wrapRef.current?.querySelector<HTMLElement>('[role="dialog"]') ?? null;

  // Focus back on close. React runs the cleanup on unmount, so a window that is removed while open (the
  // screen is left) hands focus back too. Declared before the placing effect below, so the element that
  // had focus is read before focus moves.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const previous = activeElementOf(wrap);
    return () => {
      // Nothing focused reads as the body outside a shadow root, which is not a place to go back to.
      const usable =
        previous instanceof HTMLElement &&
        previous.isConnected &&
        previous !== document.body &&
        previous !== document.documentElement;
      const back = usable ? previous : fallbackRef.current?.() ?? null;
      back?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const dialog = dialogEl();
    if (!dialog) return;
    // The shared Modal's dialog element has no name and cannot take focus; give it both, so a screen reader
    // announces the window and a click inside it keeps focus (and Escape) in here.
    dialog.setAttribute('aria-label', label);
    dialog.setAttribute('tabindex', '-1');
  }, [label]);

  useEffect(() => {
    const dialog = dialogEl();
    if (!dialog) return;
    (initialRef.current?.(dialog) ?? dialog).focus({ preventScroll: true });
  }, [focusKey]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Nothing typed in the window is for the table behind it or the host page. Stopping the
    // event only ends its trip up the tree; the key's own action (Tab, Enter on a button) is kept.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const dialog = dialogEl();
    if (!dialog) return;
    const items = Array.from(dialog.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = activeElementOf(dialog);
    if (e.shiftKey && (active === first || active === dialog)) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  return (
    <div
      ref={wrapRef}
      className="boomi-crt-modal-frame"
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === dialogEl();
      }}
      onClick={(e) => {
        // The Modal's dialog element is also its backdrop, so a click that lands on it directly missed the window.
        const onBackdrop = pressedOnBackdrop.current && e.target === dialogEl();
        pressedOnBackdrop.current = false;
        if (onBackdrop && closeOnBackdrop) onClose?.();
      }}
    >
      {children}
    </div>
  );
};

CrtModalFrame.displayName = 'CrtModalFrame';
export default CrtModalFrame;
