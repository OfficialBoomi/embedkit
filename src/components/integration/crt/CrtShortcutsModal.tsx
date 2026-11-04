/**
 * @file CrtShortcutsModal.tsx
 * @component CrtShortcutsModal
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The Keyboard shortcuts window of the cross reference table editor: a static list of the keys
 * for moving around and working in the table, in groups, with a Close button. The content is
 * plain data in crtShortcuts (keep that table current when a key changes).
 *
 * It reuses the shared Modal. The Modal renders in place (no portal to document.body), so its
 * styles, theme tokens and the host's modal offset all apply inside the plugin's shadow root,
 * and it looks like every other window of the plugin. What the shared Modal does not do is added
 * here, around it, without changing it:
 *  - it gets an accessible name and can take focus (the Modal's dialog element has neither);
 *  - focus moves into the window when it opens and goes back when it closes, to the element that
 *    had it (the table, after a mouse press, because the toolbar keeps focus on mouse down), or,
 *    when that element is gone, to `fallbackFocus`;
 *  - Tab stays inside the window, so a key can never reach the table behind it;
 *  - Escape closes it and is stopped, so it never also leaves full screen. Every other key is
 *    kept from the table and the host page too (inside a shadow root nothing shields them);
 *  - a click on the backdrop closes it, unless the press started inside the window (selecting
 *    text and letting go outside is not a click on the backdrop).
 *
 * @return {JSX.Element | null} The window while open, otherwise nothing.
 */

import { useEffect, useId, useMemo, useRef } from 'react';
import {
  getShortcutGroups,
  type CrtShortcutRow,
} from '../../../utils/crt/crtShortcuts';
import Button from '../../ui/Button';
import Modal from '../../ui/Modal';

export interface CrtShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Where focus goes on close when the element that had it before is gone (for example the table). */
  fallbackFocus?: () => HTMLElement | null;
}

const TITLE = 'Keyboard shortcuts';
const DESCRIPTION = 'Keys for moving around and working in the table. Click a cell first, so the table has focus.';

/** What Tab can reach inside the window. The dialog element itself (tabindex -1) is left out. */
const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** The focused element of the tree a node is in. Inside a shadow root document.activeElement is only the host. */
function activeElementOf(node: Node): Element | null {
  const root = node.getRootNode();
  return root instanceof Document || root instanceof ShadowRoot ? root.activeElement : null;
}

/** One row's keys: combinations joined by 'or', the keys of a combination joined by '+'. */
function renderKeys(keys: CrtShortcutRow['keys']): React.ReactNode {
  return keys.map((combo, i) => (
    <span key={i} className="boomi-crt-sc-combo">
      {i > 0 && <span className="boomi-crt-sc-or">or</span>}
      {combo.map((label, j) => (
        <span key={j} className="boomi-crt-sc-key">
          {j > 0 && <span className="boomi-crt-sc-plus">+</span>}
          <kbd>{label}</kbd>
        </span>
      ))}
    </span>
  ));
}

/** Mounted only while open, so its effects pair with opening and closing. */
const ShortcutsDialog: React.FC<Omit<CrtShortcutsModalProps, 'isOpen'>> = ({ onClose, fallbackFocus }) => {
  const uid = useId();
  const groups = useMemo(() => getShortcutGroups(), []);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pressedOnBackdrop = useRef(false);
  // Read when the window closes, so a parent that rebuilds the callback every render is fine.
  const fallbackRef = useRef(fallbackFocus);
  useEffect(() => {
    fallbackRef.current = fallbackFocus;
  });

  const dialogEl = (): HTMLElement | null =>
    wrapRef.current?.querySelector<HTMLElement>('[role="dialog"]') ?? null;

  // Focus in on open, and back on close. React runs the cleanup on unmount, so a window that is
  // removed while open (the screen is left) hands focus back too.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const previous = activeElementOf(wrap);
    const dialog = dialogEl();
    if (dialog) {
      // The shared Modal's dialog element has no name and cannot take focus; give it both, so
      // a screen reader announces the window and a click inside it keeps focus (and Escape) in here.
      dialog.setAttribute('aria-label', TITLE);
      dialog.setAttribute('tabindex', '-1');
      dialog.focus({ preventScroll: true });
    }
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Nothing typed in the window is for the table behind it or the host page. Stopping the
    // event only ends its trip up the tree; the key's own action (Tab, Enter on a button) is kept.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const dialog = dialogEl();
    if (!dialog) return;
    const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
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
      className="boomi-crt-sc-wrap"
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === dialogEl();
      }}
      onClick={(e) => {
        // The Modal's dialog element is also its backdrop, so a click that lands on it directly missed the window.
        const onBackdrop = pressedOnBackdrop.current && e.target === dialogEl();
        pressedOnBackdrop.current = false;
        if (onBackdrop) onClose();
      }}
    >
      <Modal
        isOpen
        size="wide"
        title={TITLE}
        description={DESCRIPTION}
        onClose={onClose}
        showSaveButton={false}
        showCancelButton={false}
      >
        <div className="boomi-crt-sc">
          <div className="boomi-crt-sc-groups">
            {groups.map((group, g) => {
              const titleId = `${uid}-group-${g}`;
              return (
                <section key={group.title} className="boomi-crt-sc-group" aria-labelledby={titleId}>
                  <h3 id={titleId} className="boomi-crt-sc-title">
                    {group.title}
                  </h3>
                  <dl className="boomi-crt-sc-list">
                    {group.rows.map((row, r) => (
                      <div key={r} className="boomi-crt-sc-row">
                        <dt className="boomi-crt-sc-keys">{renderKeys(row.keys)}</dt>
                        <dd className="boomi-crt-sc-action">{row.action}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              );
            })}
          </div>
          <div className="boomi-crt-sc-footer">
            <Button toggle={false} primary={false} showIcon={false} label="Close" onClick={onClose} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

const CrtShortcutsModal: React.FC<CrtShortcutsModalProps> = ({ isOpen, ...rest }) =>
  isOpen ? <ShortcutsDialog {...rest} /> : null;

CrtShortcutsModal.displayName = 'CrtShortcutsModal';
export default CrtShortcutsModal;
