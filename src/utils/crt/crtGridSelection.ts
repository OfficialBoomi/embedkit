/**
 * @file crtGridSelection.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The selection object of the lookup table grid and the pure functions that build and read
 * it. No React, so the rules can be tested without a DOM. Complements crtSelection (the
 * rectangle and row maths): this file owns the whole shape the grid keeps in state, which
 * must always change atomically, one object at a time.
 */
import type { CrtCell } from './crtTypes';
import { clampCell, normalizeRange, type CrtRange } from './crtSelection';

/** The whole selection, kept in one object so it always changes atomically. */
export interface GridSelection {
  active: CrtCell;
  anchor: CrtCell;
  focus: CrtCell;
  /** Ticked rows, ascending and unique. Never mutated; always replaced. */
  checked: number[];
  /** The row a Shift+click on a gutter checkbox extends from. */
  rowAnchor: number;
}

const ORIGIN: CrtCell = { row: 0, col: 0 };

export const NO_ROWS: number[] = [];
export const INITIAL_SELECTION: GridSelection = {
  active: ORIGIN,
  anchor: ORIGIN,
  focus: ORIGIN,
  checked: NO_ROWS,
  rowAnchor: 0,
};

/** One cell is active and nothing else is selected. */
export const plainSelection = (cell: CrtCell, rowAnchor: number): GridSelection => ({
  active: cell,
  anchor: cell,
  focus: cell,
  checked: NO_ROWS,
  rowAnchor,
});

export const cellInside = (c: CrtCell, rows: number, cols: number): boolean =>
  c.row >= 0 && c.row < rows && c.col >= 0 && c.col < cols;

/**
 * Pulls a selection back inside the grid after rows were removed behind it. Returns the same
 * object when nothing is out of range, so memoized readers stay stable.
 */
export function clampSelection(s: GridSelection, rows: number, cols: number): GridSelection {
  if (rows <= 0 || cols <= 0) return INITIAL_SELECTION;
  const checkedOk = s.checked.length === 0 || s.checked[s.checked.length - 1] < rows;
  if (
    checkedOk &&
    s.rowAnchor < rows &&
    cellInside(s.active, rows, cols) &&
    cellInside(s.anchor, rows, cols) &&
    cellInside(s.focus, rows, cols)
  ) {
    return s;
  }
  return {
    active: clampCell(s.active, rows, cols),
    anchor: clampCell(s.anchor, rows, cols),
    focus: clampCell(s.focus, rows, cols),
    checked: checkedOk ? s.checked : s.checked.filter((i) => i < rows),
    rowAnchor: Math.min(s.rowAnchor, rows - 1),
  };
}

export const selectionRange = (s: GridSelection): CrtRange => normalizeRange(s.anchor, s.focus);
export const isMultiCell = (r: CrtRange): boolean => r.r0 !== r.r1 || r.c0 !== r.c1;
export const hasAnySelection = (s: GridSelection): boolean =>
  s.checked.length > 0 || isMultiCell(selectionRange(s));

/** Ticks (or unticks) rows and drops the cell range, so only the ticked rows look selected. */
export const withChecked = (s: GridSelection, checked: number[], rowAnchor: number): GridSelection => ({
  active: s.active,
  anchor: s.active,
  focus: s.active,
  checked,
  rowAnchor,
});

/** Splits an ascending list of rows into runs of consecutive rows, as [first, last] pairs. */
export function contiguousRuns(sorted: readonly number[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (const index of sorted) {
    const last = runs[runs.length - 1];
    if (last && index === last[1] + 1) last[1] = index;
    else runs.push([index, index]);
  }
  return runs;
}
