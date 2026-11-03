/**
 * @file useGridKeyboard.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The keyboard handler of the lookup table grid. It asks the pure rules in crtKeymap what a
 * key means for the active cell (and, with Shift, for the focus corner of the range) and then
 * calls the matching operation. Keys typed in the open cell editor are handled by the editor
 * itself. Every key the grid handles is stopped here: inside a shadow root only text inputs
 * are shielded from host page hotkeys. A plain closure over the render's context, built on
 * every render as it was inside the component.
 */

import { resolveNavKey, type NavContext } from '../../../utils/crt/crtKeymap';
import { hasAnySelection } from '../../../utils/crt/crtGridSelection';
import type { CrtOp, EditMode, EditState, GridContext, GridPendingPaste } from './crtGridTypes';
import { HEADER_HEIGHT, ROW_HEIGHT } from './gridLayout';
import type { GridSelectionOps } from './useGridSelectionOps';

/** What CrtGrid owns or builds before this hook runs. */
export interface GridKeyboardParts {
  editRef: React.RefObject<EditState | null>;
  pending: GridPendingPaste;
  startEdit: (row: number, col: number, mode: EditMode, char?: string) => void;
  runOp: (op: CrtOp) => void;
  openMenuAtActive: () => void;
}

export function useGridKeyboard(
  ctx: GridContext,
  parts: GridKeyboardParts,
  selection: GridSelectionOps
): (e: React.KeyboardEvent<HTMLDivElement>) => void {
  const { store, rootRef, callbacksRef, getSel } = ctx;
  const { editRef, pending, startEdit, runOp, openMenuAtActive } = parts;
  const { extendTo, moveActive, toggleActiveRow, selectAll, selectRow, collapse } = selection;
  const { pendingPasteRef, clearPending } = pending;

  const navContext = (row: number, col: number, hasSelection: boolean): NavContext => {
    const el = rootRef.current;
    const viewport = el ? el.clientHeight - HEADER_HEIGHT : 0;
    return {
      row,
      col,
      rowCount: store.rowCount(),
      colCount: store.colCount(),
      pageRows: Math.max(1, Math.floor(viewport / ROW_HEIGHT)),
      editable: store.isEditable(),
      hasSelection,
    };
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Keys typed in the cell input are handled by the input itself.
    if (e.target !== e.currentTarget || editRef.current) return;
    if (e.key === 'Escape' && pendingPasteRef.current) {
      clearPending();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (store.rowCount() === 0) {
      // The keymap has no cell to work from, but the menu key must still reach the menu, and Undo
      // must still work: deleting every row leaves an empty table that Ctrl+Z has to refill.
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        openMenuAtActive();
        return;
      }
      const empty = resolveNavKey(e, navContext(0, 0, false));
      if (empty && (empty.type === 'undo' || empty.type === 'redo')) {
        e.preventDefault();
        e.stopPropagation();
        runOp(empty.type);
      }
      return;
    }
    const s = getSel();
    const hasSelection = hasAnySelection(s);
    let action = resolveNavKey(e, navContext(s.active.row, s.active.col, hasSelection));
    if (e.shiftKey) {
      // Extending moves the focus corner, so its target is computed from the focus cell.
      const extended = resolveNavKey(e, navContext(s.focus.row, s.focus.col, hasSelection));
      if (extended && extended.type === 'move' && extended.extend) action = extended;
    }
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    switch (action.type) {
      case 'move':
        if (action.extend) extendTo(action.row, action.col, true);
        else moveActive(action.row, action.col);
        break;
      case 'edit':
        startEdit(s.active.row, s.active.col, action.mode, action.char);
        break;
      case 'clear':
        if (action.thenEdit && !hasSelection) {
          // Backspace opens an empty editor and keeps the old value until it is committed, so Esc restores it.
          startEdit(s.active.row, s.active.col, 'replace', '');
        } else {
          // Delete, and Backspace over a range or ticked rows, empty the cells without an editor.
          runOp('clear');
        }
        break;
      case 'blocked':
        callbacksRef.current.onBlocked?.();
        break;
      case 'select-all':
        selectAll();
        break;
      case 'select-row':
        selectRow();
        break;
      case 'tick-row':
        toggleActiveRow();
        break;
      case 'undo':
      case 'redo':
        // Through run(op), like the toolbar: same notice, same selection of what changed.
        runOp(action.type);
        break;
      case 'collapse':
        collapse();
        break;
      case 'context-menu':
        openMenuAtActive();
        break;
    }
  };

  return handleKeyDown;
}
