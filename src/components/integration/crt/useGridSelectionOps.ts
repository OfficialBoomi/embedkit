/**
 * @file useGridSelectionOps.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The operations that change the selection of the lookup table grid: extend the range,
 * select a block of rows, select all, select the rows of the range, collapse, tick rows, and
 * work out which rows an operation applies to. The selection itself (state and the ref that
 * mirrors it) lives in CrtGrid. These are plain closures over the render's context, built on
 * every render exactly as they were inside the component, so nothing here is memoized and
 * re-render timing is unchanged.
 */

import { indexesBetween, targetRows, wholeGrid } from '../../../utils/crt/crtSelection';
import {
  isMultiCell,
  NO_ROWS,
  selectionRange,
  withChecked,
  type GridSelection,
} from '../../../utils/crt/crtGridSelection';
import type { GridContext } from './crtGridTypes';
import { scrollColumnIntoView, scrollRowIntoView } from './gridLayout';

export interface GridSelectionOps {
  extendTo: (row: number, col: number, scroll: boolean) => void;
  selectBlock: (first: number, last: number, scrollRow?: number) => void;
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

  return { extendTo, selectBlock, selectAll, selectRow, collapse, selectOnlyRow, toggleAll, targetsOf };
}
