/**
 * @file crtGridSelection.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Tests for the pure selection helpers the lookup table grid keeps its state in: the initial
 * and plain selections, clamping after rows are removed (including the identity guarantee that
 * keeps memoized readers stable), the range readers, ticking rows, and the runs of consecutive
 * rows used by Clear. The grid's shared wording helper is covered at the end.
 */
import { describe, it, expect } from 'vitest';
import {
  cellInside,
  clampSelection,
  contiguousRuns,
  hasAnySelection,
  INITIAL_SELECTION,
  isMultiCell,
  NO_ROWS,
  plainSelection,
  selectionRange,
  withChecked,
  type GridSelection,
} from '../../utils/crt/crtGridSelection';
import { clipboardBlockedMessage, plural } from '../../utils/crt/crtGridText';

const cell = (row: number, col: number) => ({ row, col });

const selection = (over: Partial<GridSelection> = {}): GridSelection => ({
  active: cell(0, 0),
  anchor: cell(0, 0),
  focus: cell(0, 0),
  checked: [],
  rowAnchor: 0,
  ...over,
});

describe('INITIAL_SELECTION and plainSelection', () => {
  it('starts on the top left cell with nothing ticked', () => {
    expect(INITIAL_SELECTION.active).toEqual(cell(0, 0));
    expect(INITIAL_SELECTION.anchor).toEqual(cell(0, 0));
    expect(INITIAL_SELECTION.focus).toEqual(cell(0, 0));
    expect(INITIAL_SELECTION.checked).toBe(NO_ROWS);
    expect(INITIAL_SELECTION.rowAnchor).toBe(0);
  });

  it('shares one empty list, so a plain selection never allocates ticked rows', () => {
    expect(plainSelection(cell(3, 2), 3).checked).toBe(NO_ROWS);
    expect(NO_ROWS).toHaveLength(0);
  });

  it('puts active, anchor and focus on the same cell', () => {
    const c = cell(4, 1);
    const s = plainSelection(c, 4);
    expect(s.active).toBe(c);
    expect(s.anchor).toBe(c);
    expect(s.focus).toBe(c);
    expect(s.rowAnchor).toBe(4);
  });
});

describe('cellInside', () => {
  it('is true on every edge of a 3 x 2 table', () => {
    expect(cellInside(cell(0, 0), 3, 2)).toBe(true);
    expect(cellInside(cell(2, 1), 3, 2)).toBe(true);
  });

  it('is false one past any edge and below zero', () => {
    expect(cellInside(cell(3, 0), 3, 2)).toBe(false);
    expect(cellInside(cell(0, 2), 3, 2)).toBe(false);
    expect(cellInside(cell(-1, 0), 3, 2)).toBe(false);
    expect(cellInside(cell(0, -1), 3, 2)).toBe(false);
  });

  it('is false for every cell of an empty table', () => {
    expect(cellInside(cell(0, 0), 0, 2)).toBe(false);
    expect(cellInside(cell(0, 0), 2, 0)).toBe(false);
  });
});

describe('clampSelection', () => {
  it('returns the same object when everything is already inside', () => {
    const s = selection({
      active: cell(1, 1),
      anchor: cell(0, 0),
      focus: cell(2, 1),
      checked: [0, 2],
      rowAnchor: 2,
    });
    expect(clampSelection(s, 3, 2)).toBe(s);
  });

  it('returns the initial selection for a table with no rows or no columns', () => {
    const s = selection({ active: cell(2, 1), anchor: cell(2, 1), focus: cell(2, 1), checked: [2] });
    expect(clampSelection(s, 0, 2)).toBe(INITIAL_SELECTION);
    expect(clampSelection(s, 3, 0)).toBe(INITIAL_SELECTION);
  });

  it('pulls the three cell corners back inside', () => {
    const s = selection({ active: cell(9, 5), anchor: cell(8, 4), focus: cell(7, 3) });
    const out = clampSelection(s, 3, 2);
    expect(out.active).toEqual(cell(2, 1));
    expect(out.anchor).toEqual(cell(2, 1));
    expect(out.focus).toEqual(cell(2, 1));
  });

  it('drops ticked rows past the end and keeps the rest, in order', () => {
    const s = selection({ checked: [0, 2, 5, 8], rowAnchor: 0 });
    expect(clampSelection(s, 4, 2).checked).toEqual([0, 2]);
  });

  it('keeps the ticked list object when none of its rows moved out', () => {
    const checked = [0, 1];
    const s = selection({ active: cell(9, 0), anchor: cell(9, 0), focus: cell(9, 0), checked });
    expect(clampSelection(s, 3, 2).checked).toBe(checked);
  });

  it('limits the row anchor to the last row', () => {
    const s = selection({ rowAnchor: 10 });
    expect(clampSelection(s, 4, 2).rowAnchor).toBe(3);
  });

  it('treats a row anchor on the last row as inside', () => {
    const s = selection({ rowAnchor: 3 });
    expect(clampSelection(s, 4, 2)).toBe(s);
  });

  it('does not change its argument', () => {
    const s = selection({ active: cell(9, 5), checked: [1, 9] });
    clampSelection(s, 3, 2);
    expect(s.active).toEqual(cell(9, 5));
    expect(s.checked).toEqual([1, 9]);
  });
});

describe('selectionRange, isMultiCell and hasAnySelection', () => {
  it('orders the corners into a rectangle', () => {
    const s = selection({ anchor: cell(4, 3), focus: cell(1, 0) });
    expect(selectionRange(s)).toEqual({ r0: 1, c0: 0, r1: 4, c1: 3 });
  });

  it('knows a one cell range from a larger one', () => {
    expect(isMultiCell({ r0: 2, c0: 1, r1: 2, c1: 1 })).toBe(false);
    expect(isMultiCell({ r0: 2, c0: 1, r1: 3, c1: 1 })).toBe(true);
    expect(isMultiCell({ r0: 2, c0: 1, r1: 2, c1: 2 })).toBe(true);
  });

  it('has no selection when one cell is active and nothing is ticked', () => {
    expect(hasAnySelection(INITIAL_SELECTION)).toBe(false);
    expect(hasAnySelection(plainSelection(cell(5, 1), 5))).toBe(false);
  });

  it('counts a cell range as a selection', () => {
    expect(hasAnySelection(selection({ focus: cell(0, 1) }))).toBe(true);
  });

  it('counts a ticked row as a selection even with one cell active', () => {
    expect(hasAnySelection(selection({ checked: [0] }))).toBe(true);
  });
});

describe('withChecked', () => {
  it('collapses the cell range to the active cell and sets the ticked rows and anchor', () => {
    const s = selection({ active: cell(2, 1), anchor: cell(0, 0), focus: cell(4, 1), rowAnchor: 0 });
    const out = withChecked(s, [1, 2], 2);
    expect(out).toEqual({
      active: cell(2, 1),
      anchor: cell(2, 1),
      focus: cell(2, 1),
      checked: [1, 2],
      rowAnchor: 2,
    });
  });

  it('uses the ticked list it is given, not a copy', () => {
    const checked = [3];
    expect(withChecked(selection(), checked, 3).checked).toBe(checked);
  });

  it('does not change the selection it starts from', () => {
    const s = selection({ anchor: cell(0, 0), focus: cell(4, 1) });
    withChecked(s, [1], 1);
    expect(s.focus).toEqual(cell(4, 1));
    expect(s.checked).toEqual([]);
  });
});

describe('contiguousRuns', () => {
  it('gives no runs for no rows', () => {
    expect(contiguousRuns([])).toEqual([]);
  });

  it('gives one run for one row', () => {
    expect(contiguousRuns([4])).toEqual([[4, 4]]);
  });

  it('joins consecutive rows into one run', () => {
    expect(contiguousRuns([2, 3, 4, 5])).toEqual([[2, 5]]);
  });

  it('splits at every gap', () => {
    expect(contiguousRuns([0, 1, 3, 5, 6, 9])).toEqual([
      [0, 1],
      [3, 3],
      [5, 6],
      [9, 9],
    ]);
  });

  it('does not change the list it reads', () => {
    const rows = [1, 2, 4];
    contiguousRuns(rows);
    expect(rows).toEqual([1, 2, 4]);
  });
});

describe('crtGridText', () => {
  it('uses the singular for exactly one and the plural otherwise', () => {
    expect(plural(1, 'row')).toBe('1 row');
    expect(plural(0, 'row')).toBe('0 rows');
    expect(plural(2, 'cell')).toBe('2 cells');
  });

  it('groups thousands the en-US way', () => {
    expect(plural(10000, 'row')).toBe('10,000 rows');
  });

  it('names the key to press in the blocked clipboard notice', () => {
    expect(clipboardBlockedMessage('X')).toContain('Ctrl+X');
    expect(clipboardBlockedMessage('C')).toContain('Ctrl+C');
  });
});
