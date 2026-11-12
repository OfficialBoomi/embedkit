/**
 * @file CrtMenu.tsx
 * @component CrtMenu
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The context menu of the lookup table grid. It is rendered by the grid inside its own
 * wrapper (not inside the scrolling grid element), so the grid's scroll clipping cannot
 * cut it, and it is placed with position: absolute. position: fixed is not an option here:
 * the plugin root has a CSS transform, which makes fixed boxes relative to the root.
 *
 * The coordinates (x, y) are relative to the wrapper. After mounting, the menu measures
 * itself and flips or clamps so it stays inside the wrapper.
 *
 * Keyboard: the menu opens with focus on the first enabled item. Arrow keys move (skipping
 * disabled items, wrapping), Home and End jump, Enter or Space activate, Escape and Tab
 * close. Every key it handles is stopped here so the host page never sees it. It closes on
 * any mouse press outside it; the grid closes it on scroll.
 *
 * Choosing an item calls `onSelect(id)` only. The owner decides what happens next (the grid
 * closes the menu, returns focus to itself and runs the operation).
 *
 * @return {JSX.Element} The rendered menu.
 */

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

export type CrtMenuItem =
  | {
      id: string;
      label: string;
      icon?: ReactNode;
      /** Display only, for example "Ctrl+C". The menu does not bind the key. */
      shortcut?: string;
      disabled?: boolean;
      danger?: boolean;
    }
  | { divider: true };

export interface CrtMenuProps {
  /** Left edge, relative to the wrapper the menu is rendered in. */
  x: number;
  /** Top edge, relative to the wrapper the menu is rendered in. */
  y: number;
  items: CrtMenuItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

const ENABLED_ITEM = '[role="menuitem"]:not([aria-disabled="true"])';

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/** Narrowing helper: dividers are the items without an id. */
function isDivider(item: CrtMenuItem): item is { divider: true } {
  return 'divider' in item;
}

const CrtMenu: React.FC<CrtMenuProps> = ({ x, y, items, onSelect, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  // The outside-press listener is added once; it must still call the latest callback.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const enabledItems = (): HTMLElement[] =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ENABLED_ITEM) ?? []);

  // A layout effect runs before the browser paints, so the menu never flashes at the raw spot.
  useLayoutEffect(() => {
    const el = menuRef.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    // The usable area is the wrapper cut down to what is on screen: a tall grid can reach below
    // the bottom of the window, and a menu placed there would have items out of reach.
    // A small margin keeps it off the window edge.
    const edge = 8;
    const rect = box.getBoundingClientRect();
    const minX = Math.max(0, edge - rect.left);
    const minY = Math.max(0, edge - rect.top);
    const maxX = Math.min(box.clientWidth, window.innerWidth - edge - rect.left);
    const maxY = Math.min(box.clientHeight, window.innerHeight - edge - rect.top);
    // Measure at its natural size, then limit the height to the space there is.
    el.style.maxHeight = '';
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Flip to the other side of the pointer first, then clamp what still does not fit.
    let left = x + w > maxX ? x - w : x;
    let top = y + h > maxY ? y - h : y;
    left = clamp(left, minX, Math.max(minX, maxX - w));
    top = clamp(top, minY, Math.max(minY, maxY - h));
    // Taller than the space: scroll inside the menu rather than push items off screen.
    el.style.maxHeight = `${Math.max(0, maxY - minY)}px`;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, items.length]);

  // Opens with focus on the first enabled item. Runs once per menu instance.
  useLayoutEffect(() => {
    // With every item disabled the menu itself takes focus, so Escape still closes it.
    (enabledItems()[0] ?? menuRef.current)?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onPress = (e: MouseEvent) => {
      const el = menuRef.current;
      // Inside a shadow root the event target is retargeted to the host, so use the path.
      if (el && e.composedPath().includes(el)) return;
      onCloseRef.current();
    };
    document.addEventListener('mousedown', onPress, true);
    return () => document.removeEventListener('mousedown', onPress, true);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const enabled = enabledItems();
    const at = enabled.indexOf(e.target as HTMLElement);
    const focusAt = (i: number) => enabled[i]?.focus({ preventScroll: true });
    const n = enabled.length;

    switch (e.key) {
      case 'ArrowDown':
        if (n > 0) focusAt(at < 0 ? 0 : (at + 1) % n);
        break;
      case 'ArrowUp':
        if (n > 0) focusAt(at < 0 ? n - 1 : (at - 1 + n) % n);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(n - 1);
        break;
      case 'Enter':
      case ' ': {
        const id = at >= 0 ? enabled[at].dataset.id : undefined;
        if (id) onSelect(id);
        break;
      }
      case 'Escape':
      case 'Tab':
        onClose();
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Row actions"
      tabIndex={-1}
      className="boomi-menu boomi-crt-menu"
      style={{ left: x, top: y }}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (isDivider(item)) {
          return <div key={`d${i}`} role="separator" className="boomi-menu-divider" />;
        }
        const className =
          'boomi-menu-item' +
          (item.danger ? ' boomi-menu-item--danger' : '') +
          (item.disabled ? ' boomi-crt-menu-item--disabled' : '');
        return (
          <div
            key={item.id}
            role="menuitem"
            tabIndex={-1}
            aria-disabled={item.disabled ? true : undefined}
            data-id={item.id}
            className={className}
            onMouseMove={(e) => {
              // Hover and keyboard share one highlight: the focused item.
              if (item.disabled || e.currentTarget.matches(':focus')) return;
              e.currentTarget.focus({ preventScroll: true });
            }}
            onClick={() => {
              if (!item.disabled) onSelect(item.id);
            }}
          >
            {item.icon}
            <span className="boomi-crt-menu-label">{item.label}</span>
            {item.shortcut && <span className="boomi-crt-menu-shortcut">{item.shortcut}</span>}
          </div>
        );
      })}
    </div>
  );
};

CrtMenu.displayName = 'CrtMenu';
export default CrtMenu;
