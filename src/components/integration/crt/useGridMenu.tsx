/**
 * @file useGridMenu.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The context menu of the lookup table grid: where it opens (at the pointer or hanging off the
 * active cell), the items it shows, the right-click handler and the scroll handler that closes
 * it. The open state, the refs that describe it and its close function live in CrtGrid, whose
 * reset effects need them; this hook only decides when and where to open and what to list.
 * The item list is the one memoized value here, on the same dependencies it always had.
 */

import { useMemo } from 'react';
import {
  AiOutlineArrowDown,
  AiOutlineArrowUp,
  AiOutlineClear,
  AiOutlineCopy,
  AiOutlineDelete,
  AiOutlineDiff,
  AiOutlineInsertRowAbove,
  AiOutlineInsertRowBelow,
  AiOutlinePlus,
  AiOutlineScissor,
  AiOutlineSnippets,
  AiOutlineVerticalAlignBottom,
  AiOutlineVerticalAlignTop,
} from 'react-icons/ai';
import { plainSelection, selectionRange } from '../../../utils/crt/crtGridSelection';
import { inRange } from '../../../utils/crt/crtSelection';
import { isMacPlatform } from '../../../utils/crt/crtShortcuts';
import type { CrtMenuItem } from './CrtMenu';
import { isOpEnabled } from './CrtToolbar';
import type { CrtGridInfo, CrtOp, GridContext, GridMenuState } from './crtGridTypes';
import {
  cellFromEvent,
  GUTTER_WIDTH,
  gutterRowFromEvent,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  scrollColumnIntoView,
  scrollRowIntoView,
} from './gridLayout';
import type { GridSelectionOps } from './useGridSelectionOps';

/** What CrtGrid builds before this hook runs. */
export interface GridMenuParts {
  commitEditor: () => void;
  runOp: (op: CrtOp) => void;
  info: CrtGridInfo;
}

export interface GridMenu {
  menuItems: CrtMenuItem[] | null;
  openMenuAtActive: () => void;
  handleMenuSelect: (id: string) => void;
  handleContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleScroll: () => void;
}

export function useGridMenu(
  ctx: GridContext,
  state: GridMenuState,
  parts: GridMenuParts,
  selection: GridSelectionOps
): GridMenu {
  const { store, layout, rootRef, boxRef, getSel, applySel } = ctx;
  const { menu, setMenu, menuOpenRef, menuScrollRef, closeMenu } = state;
  const { commitEditor, runOp, info } = parts;
  const { selectOnlyRow } = selection;

  const openMenu = (x: number, y: number) => {
    const el = rootRef.current;
    menuScrollRef.current = el ? { top: el.scrollTop, left: el.scrollLeft } : null;
    menuOpenRef.current = true;
    setMenu({ x, y });
  };

  /** The menu coordinates are relative to the wrapper, which shares its origin with the grid root. */
  const openMenuAtPointer = (clientX: number, clientY: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    openMenu(clientX - box.left, clientY - box.top);
  };

  /** Keyboard: the menu hangs off the bottom left of the active cell (or the top of an empty table). */
  const openMenuAtActive = () => {
    const el = rootRef.current;
    const box = boxRef.current?.getBoundingClientRect();
    if (!el || !box) return;
    const rect = el.getBoundingClientRect();
    const originX = rect.left - box.left + el.clientLeft;
    const originY = rect.top - box.top + el.clientTop;
    if (store.rowCount() === 0) {
      openMenu(originX + GUTTER_WIDTH, originY + HEADER_HEIGHT);
      return;
    }
    const { active } = getSel();
    scrollRowIntoView(el, active.row);
    scrollColumnIntoView(el, layout, active.col);
    // The first data column is frozen, so it never moves with the horizontal scroll.
    const left = active.col === 0 ? GUTTER_WIDTH : layout.lefts[active.col] - el.scrollLeft;
    const top = HEADER_HEIGHT + active.row * ROW_HEIGHT - el.scrollTop + ROW_HEIGHT;
    openMenu(originX + left + 8, originY + top);
  };

  const menuItems = useMemo<CrtMenuItem[] | null>(() => {
    if (!menu) return null;
    const mod = isMacPlatform() ? '⌘' : 'Ctrl+';
    const item = (
      op: CrtOp,
      label: string,
      icon: React.ReactNode,
      extra: { shortcut?: string; danger?: boolean } = {}
    ): CrtMenuItem => ({
      id: op,
      label,
      icon,
      disabled: !isOpEnabled(op, info),
      ...extra,
    });
    const list: CrtMenuItem[] = [];
    if (!info.hasRows) {
      list.push(item('add-row', 'Add row', <AiOutlinePlus className="boomi-menu-icon" />), { divider: true });
    }
    list.push(
      item('cut', 'Cut', <AiOutlineScissor className="boomi-menu-icon" />, { shortcut: `${mod}X` }),
      item('copy', 'Copy', <AiOutlineCopy className="boomi-menu-icon" />, { shortcut: `${mod}C` }),
      item('paste', 'Paste', <AiOutlineSnippets className="boomi-menu-icon" />, { shortcut: `${mod}V` }),
      item('paste-above', 'Paste above', <AiOutlineVerticalAlignTop className="boomi-menu-icon" />),
      item('paste-below', 'Paste below', <AiOutlineVerticalAlignBottom className="boomi-menu-icon" />),
      { divider: true },
      item('insert-above', 'Insert above', <AiOutlineInsertRowAbove className="boomi-menu-icon" />),
      item('insert-below', 'Insert below', <AiOutlineInsertRowBelow className="boomi-menu-icon" />),
      item('duplicate', 'Duplicate', <AiOutlineDiff className="boomi-menu-icon" />),
      item('move-up', 'Move up', <AiOutlineArrowUp className="boomi-menu-icon" />),
      item('move-down', 'Move down', <AiOutlineArrowDown className="boomi-menu-icon" />),
      { divider: true },
      item('clear', 'Clear contents', <AiOutlineClear className="boomi-menu-icon" />),
      item(
        'delete',
        info.targetCount > 1 ? `Delete ${info.targetCount} rows` : 'Delete row',
        <AiOutlineDelete className="boomi-menu-icon" />,
        { danger: true }
      )
    );
    return list;
  }, [menu, info]);

  const handleMenuSelect = (id: string) => {
    closeMenu(true);
    runOp(id as CrtOp);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // The cell editor keeps the browser's own text menu.
    if (target.tagName === 'INPUT') return;
    const cell = cellFromEvent(e);
    const gutterRow = gutterRowFromEvent(e);
    // An empty table has no cells, so its whole body (not the header) opens the menu.
    const emptyBody = store.rowCount() === 0 && !target.closest('.boomi-crt-header');
    if (!cell && gutterRow === null && !emptyBody) return;
    e.preventDefault();
    e.stopPropagation();
    commitEditor();
    const s = getSel();
    if (cell) {
      const inside =
        s.checked.length > 0
          ? s.checked.includes(cell.row)
          : inRange(selectionRange(s), cell.row, cell.col);
      if (!inside) applySel(plainSelection(cell, cell.row));
    } else if (gutterRow !== null && !s.checked.includes(gutterRow)) {
      selectOnlyRow(gutterRow);
    }
    openMenuAtPointer(e.clientX, e.clientY);
  };

  const handleScroll = () => {
    if (!menuOpenRef.current) return;
    const el = rootRef.current;
    const at = menuScrollRef.current;
    // Opening the menu can itself scroll the active cell into view; that is not the user scrolling.
    if (el && at && el.scrollTop === at.top && el.scrollLeft === at.left) return;
    closeMenu(false);
  };

  return { menuItems, openMenuAtActive, handleMenuSelect, handleContextMenu, handleScroll };
}
