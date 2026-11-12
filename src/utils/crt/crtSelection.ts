/**
 * @file crtSelection.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Pure helpers for the cross reference table editor's selection: the rectangle between two
 * cells, the rows an operation applies to, and the text that describes the selection. No React,
 * so the rules can be tested without a DOM. Everything is zero based except the label text.
 */
import type { CrtCell } from './crtTypes';

/** A rectangle of cells, inclusive on every side, with r0 <= r1 and c0 <= c1. */
export interface CrtRange {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** The rectangle spanned by two corner cells, given in any order. */
export function normalizeRange(a: CrtCell, b: CrtCell): CrtRange {
  return {
    r0: Math.min(a.row, b.row),
    c0: Math.min(a.col, b.col),
    r1: Math.max(a.row, b.row),
    c1: Math.max(a.col, b.col),
  };
}

export function inRange(range: CrtRange, row: number, col: number): boolean {
  return row >= range.r0 && row <= range.r1 && col >= range.c0 && col <= range.c1;
}

/** Number of rows the range covers. */
export function rangeRows(range: CrtRange): number {
  return range.r1 - range.r0 + 1;
}

/** Number of columns the range covers. */
export function rangeCols(range: CrtRange): number {
  return range.c1 - range.c0 + 1;
}

/** Pulls a cell back inside the grid. An empty grid has no cell, so it answers 0,0. */
export function clampCell(cell: CrtCell, rowCount: number, colCount: number): CrtCell {
  return {
    row: Math.min(Math.max(cell.row, 0), Math.max(rowCount - 1, 0)),
    col: Math.min(Math.max(cell.col, 0), Math.max(colCount - 1, 0)),
  };
}

/**
 * Rows a..b (either order) across every column. With no columns the range keeps c1 at 0 so
 * that c0 <= c1 still holds, the same way clampCell answers 0,0 for an empty grid.
 */
export function wholeRows(a: number, b: number, colCount: number): CrtRange {
  return { r0: Math.min(a, b), c0: 0, r1: Math.max(a, b), c1: Math.max(colCount - 1, 0) };
}

/** Every cell of the grid, or null when there are no rows or no columns. */
export function wholeGrid(rowCount: number, colCount: number): CrtRange | null {
  if (rowCount <= 0 || colCount <= 0) return null;
  return { r0: 0, c0: 0, r1: rowCount - 1, c1: colCount - 1 };
}

/** Every integer from a to b inclusive, ascending, whichever way round they are given. */
export function indexesBetween(a: number, b: number): number[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const out: number[] = new Array(hi - lo + 1);
  for (let i = 0; i < out.length; i++) out[i] = lo + i;
  return out;
}

/**
 * Adds the index when it is missing, removes it when it is there. `sorted` must already be
 * ascending and unique (the checked-rows list always is); the result is a new array that is
 * too. The insert point is found by binary search because the list can hold 10,000 rows.
 */
export function toggleIndex(sorted: readonly number[], index: number): number[] {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < index) lo = mid + 1;
    else hi = mid;
  }
  const out = sorted.slice();
  if (lo < out.length && out[lo] === index) out.splice(lo, 1);
  else out.splice(lo, 0, index);
  return out;
}

/**
 * The rows a row operation (delete, move, duplicate, insert) applies to: the ticked rows when
 * there are any, else the rows the cell range crosses, else just the active row. Always a new,
 * ascending, unique array.
 */
export function targetRows(
  checked: readonly number[],
  range: CrtRange | null,
  activeRow: number,
): number[] {
  if (checked.length > 0) {
    return Array.from(new Set(checked)).sort((a, b) => a - b);
  }
  if (range) return indexesBetween(range.r0, range.r1);
  return [activeRow];
}

function plural(count: number, word: string): string {
  return `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * The short text for the status area. Ticked rows win over the cell range. Row numbers are
 * 1 based, like the numbers in the gutter. A column with no name is called "column N" (also
 * 1 based) so the label never ends in a bare comma.
 */
export function describeSelection(
  checked: readonly number[],
  range: CrtRange | null,
  columns: readonly string[],
): string {
  if (checked.length > 0) return `${plural(checked.length, 'row')} selected`;
  if (!range) return '';

  const rows = rangeRows(range);
  const cols = rangeCols(range);
  const colName = (c: number): string => columns[c] || `column ${c + 1}`;

  if (rows === 1 && cols === 1) return `Row ${range.r0 + 1}, ${colName(range.c0)}`;
  if (rows === 1) return `Row ${range.r0 + 1}, ${plural(cols, 'column')}`;
  if (cols === 1) return `${plural(rows, 'row')}, ${colName(range.c0)}`;
  return `${plural(rows, 'row')}, ${plural(cols, 'column')}`;
}
