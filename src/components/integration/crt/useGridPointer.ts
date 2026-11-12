/**
 * @file useGridPointer.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The mouse handlers of the lookup table grid: press (select a cell, extend with Shift, tick
 * rows in the gutter, the select all checkbox), drag to extend the range, and double click to
 * edit. The drag flag, its document listener cleanup and `endDrag` live in CrtGrid, whose
 * reset and unmount effects must be able to end a drag. Plain closures over the render's
 * context, built on every render as they were inside the component.
 */

import { indexesBetween, toggleIndex } from '../../../utils/crt/crtSelection';
import {
  NO_ROWS,
  plainSelection,
  withChecked,
  type GridSelection,
} from '../../../utils/crt/crtGridSelection';
import type { EditMode, GridContext } from './crtGridTypes';
import { cellFromEvent, gutterRowFromEvent } from './gridLayout';
import type { GridSelectionOps } from './useGridSelectionOps';

/** What CrtGrid owns or builds before this hook runs. */
export interface GridPointerParts {
  selRef: React.RefObject<GridSelection>;
  draggingRef: React.RefObject<boolean>;
  dragCleanupRef: React.RefObject<(() => void) | null>;
  endDrag: () => void;
  startEdit: (row: number, col: number, mode: EditMode, char?: string) => void;
}

export interface GridPointer {
  handleMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function useGridPointer(
  ctx: GridContext,
  parts: GridPointerParts,
  selection: GridSelectionOps
): GridPointer {
  const { store, callbacksRef, getSel, applySel, focusRoot } = ctx;
  const { selRef, draggingRef, dragCleanupRef, endDrag, startEdit } = parts;
  const { toggleAll, selectOnlyRow, extendTo } = selection;

  /** A click in the gutter: the checkbox toggles, the number selects the row. */
  const handleGutterPress = (e: React.MouseEvent<HTMLDivElement>, row: number, onCheckbox: boolean) => {
    const s = getSel();
    if (e.shiftKey) {
      // A Shift range replaces the ticked set, from the last row that was ticked or picked.
      applySel(withChecked(s, indexesBetween(Math.min(s.rowAnchor, store.rowCount() - 1), row), s.rowAnchor));
    } else if (onCheckbox || e.ctrlKey || e.metaKey) {
      applySel(withChecked(s, toggleIndex(s.checked, row), row));
    } else {
      selectOnlyRow(row);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Clicks inside the open input place the caret.
    if (target.tagName === 'INPUT') return;
    if (target.closest('[data-checkall]')) {
      toggleAll();
      focusRoot();
      return;
    }
    const gutterRow = gutterRowFromEvent(e);
    if (gutterRow !== null) {
      handleGutterPress(e, gutterRow, !!target.closest('[data-check]'));
      focusRoot();
      return;
    }
    const cell = cellFromEvent(e);
    if (!cell) return;
    // No multiple ranges: Ctrl and Cmd clicks are left alone (on a Mac they also open the menu).
    if (e.ctrlKey || e.metaKey) return;
    if (e.shiftKey) {
      extendTo(cell.row, cell.col, false);
    } else {
      applySel(plainSelection(cell, cell.row));
    }
    // Dragging extends the range until the button is released, even outside the grid.
    endDrag();
    draggingRef.current = true;
    const up = () => endDrag();
    document.addEventListener('mouseup', up);
    dragCleanupRef.current = () => document.removeEventListener('mouseup', up);
    focusRoot();
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    // The button was released somewhere the document never heard about.
    if (e.buttons === 0) {
      endDrag();
      return;
    }
    const cell = cellFromEvent(e);
    if (!cell) return;
    const s = selRef.current;
    if (s.focus.row === cell.row && s.focus.col === cell.col) return;
    applySel({ ...s, focus: cell, checked: NO_ROWS });
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    applySel(plainSelection(cell, cell.row));
    if (store.isEditable()) {
      startEdit(cell.row, cell.col, 'append');
    } else {
      callbacksRef.current.onBlocked?.();
    }
  };

  return { handleMouseDown, handleMouseMove, handleDoubleClick };
}
