/**
 * @file useGridSelectionOps.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The operations that change the selection of the lookup table grid: extend the range, move
 * the active cell from the keyboard, select a block of rows, select all, select the rows of the
 * range, collapse, tick rows, show what an undo or redo touched, and work out which rows an
 * operation applies to. The selection itself (state and the ref that mirrors it) lives in
 * CrtGrid. These are plain closures over the render's context, built on every render exactly
 * as they were inside the component, so nothing here is memoized and re-render timing is
 * unchanged.
 */

import {
  indexesBetween,
  targetRows,
  toggleIndex,
  wholeGrid,
  type CrtRange,
} from '../../../utils/crt/crtSelection';
import {
  INITIAL_SELECTION,
  isMultiCell,
  NO_ROWS,
  plainSelection,
  selectionRange,
  withChecked,
  type GridSelection,
} from '../../../utils/crt/crtGridSelection';
import type { GridContext } from './crtGridTypes';
import { scrollColumnIntoView, scrollRowIntoView } from './gridLayout';

export interface GridSelectionOps {
  extendTo: (row: number, col: number, scroll: boolean) => void;
  moveActive: (row: number, col: number) => void;
  toggleActiveRow: () => void;
  selectBlock: (first: number, last: number, scrollRow?: number) => void;
  selectRegion: (region: CrtRange | null) => void;
  selectAll: () => void;
  selectRow: () => void;
  collapse: () => void;
  selectOnlyRow: (row: number) => void;
  toggleAll: () => void;
  targetsOf: (s: GridSelection) => number[];
}

export function useGridSelectionOps(ctx: GridContext): GridSelectionOps {
  const { store, layout, rootRef, scrollTargetRef, getSel, applySel } = ctx;

  /** Moves only the `focus` corner of the range (Shift+arrows, Shift+click, drag). */
  const extendTo = (row: number, col: number, scroll: boolean) => {
    const s = getSel();
    if (s.focus.row === row && s.focus.col === col && s.checked.length === 0) return;
    applySel({ ...s, focus: { row, col }, checked: NO_ROWS });
    const el = rootRef.current;
    if (!el || !scroll) return;
    scrollRowIntoView(el, row);
    scrollColumnIntoView(el, layout, col);
  };

  /**
   * A plain keyboard move (arrows, Tab, Page keys, Home and End). Ticked rows and the row anchor
   * stay and only the active cell moves, so rows that are not next to each other can be ticked
   * from the keyboard: tick, move past some rows, tick again. With no ticked rows it is the
   * plain move it always was. Committing a cell edit and clicking a cell do not come through
   * here; they still start over from one plain cell.
   */
  const moveActive = (row: number, col: number) => {
    const s = getSel();
    const cell = { row, col };
    applySel(
      s.checked.length > 0
        ? { active: cell, anchor: cell, focus: cell, checked: s.checked, rowAnchor: s.rowAnchor }
        : plainSelection(cell, row)
    );
    const el = rootRef.current;
    if (!el) return;
    scrollRowIntoView(el, row);
    scrollColumnIntoView(el, layout, col);
  };

  /**
   * Space: ticks or unticks the active row. The same toggle a click on its gutter checkbox
   * makes (useGridPointer), including the row anchor a later Shift+click extends from. It only
   * changes the selection, so it also works on a read only table.
   */
  const toggleActiveRow = () => {
    const s = getSel();
    const row = s.active.row;
    applySel(withChecked(s, toggleIndex(s.checked, row), row));
    // The active row can have been scrolled away from with the mouse wheel; show what was ticked.
    const el = rootRef.current;
    if (el) scrollRowIntoView(el, row);
  };

  /** Selects whole rows first..last, active in the first column of the first row. */
  const selectBlock = (first: number, last: number, scrollRow = first) => {
    const lastCol = Math.max(store.colCount() - 1, 0);
    applySel({
      active: { row: first, col: 0 },
      anchor: { row: first, col: 0 },
      focus: { row: last, col: lastCol },
      checked: NO_ROWS,
      rowAnchor: first,
    });
    scrollTargetRef.current = { row: scrollRow, col: 0 };
  };

  /**
   * Shows what an undo or redo changed: the top left of the region is the active cell, the range
   * spans the region and no row stays ticked (the rows behind the old ticks may have moved or
   * gone). The scroll waits for the next render, like the row operations, because rows may have
   * just come back. A null region (an empty table, or nothing to point at) keeps the active cell.
   */
  const selectRegion = (region: CrtRange | null) => {
    if (store.rowCount() === 0) {
      applySel(INITIAL_SELECTION);
      return;
    }
    if (!region) {
      const s = getSel();
      applySel(plainSelection(s.active, s.active.row));
      scrollTargetRef.current = { row: s.active.row, col: s.active.col };
      return;
    }
    const top = { row: region.r0, col: region.c0 };
    applySel({
      active: top,
      anchor: top,
      focus: { row: region.r1, col: region.c1 },
      checked: NO_ROWS,
      rowAnchor: region.r0,
    });
    scrollTargetRef.current = { row: region.r0, col: region.c0 };
  };

  const selectAll = () => {
    const grid = wholeGrid(store.rowCount(), store.colCount());
    if (!grid) return;
    const s = getSel();
    applySel({
      active: s.active,
      anchor: { row: grid.r0, col: grid.c0 },
      focus: { row: grid.r1, col: grid.c1 },
      checked: NO_ROWS,
      rowAnchor: s.rowAnchor,
    });
  };

  /** Shift+Space: the rows of the range (or the active row), across every column. */
  const selectRow = () => {
    const s = getSel();
    const multi = isMultiCell(selectionRange(s));
    const from = multi ? s.anchor.row : s.active.row;
    const to = multi ? s.focus.row : s.active.row;
    applySel({
      active: s.active,
      anchor: { row: from, col: 0 },
      focus: { row: to, col: Math.max(store.colCount() - 1, 0) },
      checked: NO_ROWS,
      rowAnchor: s.rowAnchor,
    });
  };

  const collapse = () => {
    const s = getSel();
    applySel({ active: s.active, anchor: s.active, focus: s.active, checked: NO_ROWS, rowAnchor: s.rowAnchor });
  };

  /** A click on a row number: only that row, ticked and as the cell range. */
  const selectOnlyRow = (row: number) => {
    const s = getSel();
    const lastCol = Math.max(store.colCount() - 1, 0);
    applySel({
      active: { row, col: Math.min(s.active.col, lastCol) },
      anchor: { row, col: 0 },
      focus: { row, col: lastCol },
      checked: [row],
      rowAnchor: row,
    });
  };

  const toggleAll = () => {
    const rows = store.rowCount();
    if (rows === 0) return;
    const s = getSel();
    const all = s.checked.length === rows;
    applySel(withChecked(s, all ? NO_ROWS : indexesBetween(0, rows - 1), s.rowAnchor));
  };

  /** The rows a row operation applies to. None when the table has no rows. */
  const targetsOf = (s: GridSelection): number[] =>
    store.rowCount() === 0 ? [] : targetRows(s.checked, selectionRange(s), s.active.row);

  return {
    extendTo,
    moveActive,
    toggleActiveRow,
    selectBlock,
    selectRegion,
    selectAll,
    selectRow,
    collapse,
    selectOnlyRow,
    toggleAll,
    targetsOf,
  };
}
