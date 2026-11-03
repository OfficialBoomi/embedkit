/**
 * @file useGridRowOps.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The row operations of the lookup table grid: add, insert above and below, duplicate,
 * delete (with the confirm step for two or more rows), move and clear. Each one changes the
 * store and then parks the selection where the user expects it. Plain closures over the
 * render's context, built on every render as they were inside the component.
 */

import {
  contiguousRuns,
  INITIAL_SELECTION,
  isMultiCell,
  NO_ROWS,
  plainSelection,
  selectionRange,
} from '../../../utils/crt/crtGridSelection';
import { plural } from '../../../utils/crt/crtGridText';
import type { GridContext } from './crtGridTypes';
import type { GridSelectionOps } from './useGridSelectionOps';
import { MAX_ROWS_MESSAGE } from './CrtToolbar';

export interface GridRowOps {
  readRow: (row: number) => string[];
  addRow: () => void;
  insertBlank: (where: 'above' | 'below') => void;
  duplicate: () => void;
  removeRows: (rows: number[], col: number) => number;
  deleteSelected: () => Promise<void>;
  moveSelected: (delta: -1 | 1) => void;
  clearSelected: () => void;
}

export function useGridRowOps(
  ctx: GridContext,
  selection: GridSelectionOps,
  deleteBusyRef: React.RefObject<boolean>
): GridRowOps {
  const { store, storeRef, callbacksRef, scrollTargetRef, getSel, applySel, focusRoot, notice } = ctx;
  const { selectBlock, targetsOf } = selection;

  const readRow = (row: number): string[] => {
    const out: string[] = [];
    for (let c = 0; c < store.colCount(); c++) out.push(store.getCell(row, c));
    return out;
  };

  const blankRows = (n: number): string[][] =>
    Array.from({ length: n }, () => new Array<string>(store.colCount()).fill(''));

  const addRow = () => {
    const index = store.insertRows(store.rowCount(), blankRows(1));
    if (index < 0) {
      notice(MAX_ROWS_MESSAGE, 'warn');
      return;
    }
    selectBlock(index, index);
  };

  const insertBlank = (where: 'above' | 'below') => {
    const t = targetsOf(getSel());
    const n = Math.max(t.length, 1);
    const at = t.length === 0 ? 0 : where === 'above' ? t[0] : t[t.length - 1] + 1;
    const index = store.insertRows(at, blankRows(n));
    if (index < 0) {
      notice(MAX_ROWS_MESSAGE, 'warn');
      return;
    }
    selectBlock(index, index + n - 1);
  };

  const duplicate = () => {
    const t = targetsOf(getSel());
    if (t.length === 0) return;
    const index = store.insertRows(t[t.length - 1] + 1, t.map(readRow));
    if (index < 0) {
      notice(MAX_ROWS_MESSAGE, 'warn');
      return;
    }
    selectBlock(index, index + t.length - 1);
  };

  /** Removes rows and parks the selection on the row that took the first removed row's place. */
  const removeRows = (rows: number[], col: number): number => {
    const removed = store.deleteRows(rows);
    if (removed === 0) return 0;
    const left = store.rowCount();
    if (left === 0) {
      applySel(INITIAL_SELECTION);
    } else {
      const row = Math.min(rows[0], left - 1);
      const c = Math.min(col, store.colCount() - 1);
      applySel(plainSelection({ row, col: c }, row));
      scrollTargetRef.current = { row, col: c };
    }
    return removed;
  };

  const deleteSelected = async () => {
    const s = getSel();
    const t = targetsOf(s);
    if (t.length === 0 || deleteBusyRef.current) return;
    const confirm = callbacksRef.current.confirmDelete;
    // After a dialog the owner of confirmDelete gives focus back once the dialog has finished
    // closing. Taking it here, as the answer arrives, would put focus in the grid while the
    // page is still hidden behind the closing dialog.
    const askedFirst = t.length >= 2 && !!confirm;
    if (askedFirst) {
      deleteBusyRef.current = true;
      let ok = false;
      try {
        ok = await confirm(t.length);
      } finally {
        deleteBusyRef.current = false;
      }
      if (!ok || storeRef.current !== store) return;
    }
    const removed = removeRows(t, s.active.col);
    if (removed > 0) notice(`${plural(removed, 'row')} deleted`);
    if (!askedFirst) focusRoot();
  };

  const moveSelected = (delta: -1 | 1) => {
    const s = getSel();
    const t = targetsOf(s);
    if (t.length === 0) return;
    const moved = store.moveRows(t, delta);
    if (moved.length === 0) {
      notice(delta < 0 ? 'Already at the top' : 'Already at the bottom', 'warn');
      return;
    }
    const first = moved[0];
    const last = moved[moved.length - 1];
    const lastCol = Math.max(store.colCount() - 1, 0);
    const start = { row: first, col: 0 };
    if (s.checked.length > 0) {
      // Ticked rows can be apart, so the moved rows stay ticked and no range spans the gap.
      applySel({ active: start, anchor: start, focus: start, checked: moved, rowAnchor: first });
    } else {
      applySel({
        active: start,
        anchor: start,
        focus: { row: last, col: lastCol },
        checked: NO_ROWS,
        rowAnchor: first,
      });
    }
    scrollTargetRef.current = { row: delta < 0 ? first : last, col: 0 };
  };

  const clearSelected = () => {
    if (store.rowCount() === 0) return;
    const s = getSel();
    if (s.checked.length > 0) {
      const lastCol = store.colCount() - 1;
      for (const [first, last] of contiguousRuns(s.checked)) store.fillCells(first, 0, last, lastCol, '');
      return;
    }
    const r = selectionRange(s);
    if (isMultiCell(r)) store.fillCells(r.r0, r.c0, r.r1, r.c1, '');
    else store.setCell(r.r0, r.c0, '');
  };

  return {
    readRow,
    addRow,
    insertBlank,
    duplicate,
    removeRows,
    deleteSelected,
    moveSelected,
    clearSelected,
  };
}
