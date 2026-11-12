/**
 * @file crtSelection.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Tests for the cross reference table selection helpers: the rectangle between two cells,
 * clamping, whole row and whole grid ranges, the sorted index list behind the row checkboxes,
 * which rows an operation targets, and the exact text that describes a selection.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeRange,
  inRange,
  rangeRows,
  rangeCols,
  clampCell,
  wholeRows,
  wholeGrid,
  indexesBetween,
  toggleIndex,
  targetRows,
  describeSelection,
  type CrtRange,
} from '../../utils/crt/crtSelection';

const cell = (row: number, col: number) => ({ row, col });
const range = (r0: number, c0: number, r1: number, c1: number): CrtRange => ({ r0, c0, r1, c1 });

describe('normalizeRange', () => {
  it('keeps corners that are already in order', () => {
    expect(normalizeRange(cell(1, 2), cell(4, 6))).toEqual(range(1, 2, 4, 6));
  });

  it('orders corners given bottom right first', () => {
    expect(normalizeRange(cell(4, 6), cell(1, 2))).toEqual(range(1, 2, 4, 6));
  });

  it('orders corners given bottom left to top right', () => {
    expect(normalizeRange(cell(4, 2), cell(1, 6))).toEqual(range(1, 2, 4, 6));
    expect(normalizeRange(cell(1, 6), cell(4, 2))).toEqual(range(1, 2, 4, 6));
  });

  it('gives a 1x1 range for the same cell twice', () => {
    expect(normalizeRange(cell(3, 3), cell(3, 3))).toEqual(range(3, 3, 3, 3));
  });

  it('does not change its arguments', () => {
    const a = cell(4, 6);
    const b = cell(1, 2);
    normalizeRange(a, b);
    expect(a).toEqual(cell(4, 6));
    expect(b).toEqual(cell(1, 2));
  });
});

describe('inRange', () => {
  const r = range(2, 1, 4, 3);

  it('is true on every edge and corner (inclusive)', () => {
    expect(inRange(r, 2, 1)).toBe(true);
    expect(inRange(r, 4, 3)).toBe(true);
    expect(inRange(r, 2, 3)).toBe(true);
    expect(inRange(r, 4, 1)).toBe(true);
    expect(inRange(r, 3, 2)).toBe(true);
  });

  it('is false one step outside on each side', () => {
    expect(inRange(r, 1, 2)).toBe(false);
    expect(inRange(r, 5, 2)).toBe(false);
    expect(inRange(r, 3, 0)).toBe(false);
    expect(inRange(r, 3, 4)).toBe(false);
  });

  it('works for a 1x1 range', () => {
    const one = range(7, 7, 7, 7);
    expect(inRange(one, 7, 7)).toBe(true);
    expect(inRange(one, 7, 8)).toBe(false);
  });
});

describe('rangeRows and rangeCols', () => {
  it('count rows and columns inclusively', () => {
    expect(rangeRows(range(2, 1, 4, 3))).toBe(3);
    expect(rangeCols(range(2, 1, 4, 3))).toBe(3);
    expect(rangeRows(range(0, 0, 9999, 19))).toBe(10000);
    expect(rangeCols(range(0, 0, 9999, 19))).toBe(20);
  });

  it('give 1 for a single cell', () => {
    expect(rangeRows(range(5, 5, 5, 5))).toBe(1);
    expect(rangeCols(range(5, 5, 5, 5))).toBe(1);
  });
});

describe('clampCell', () => {
  it('leaves a cell inside the grid alone', () => {
    expect(clampCell(cell(3, 4), 10, 5)).toEqual(cell(3, 4));
  });

  it('pulls a cell past the end back to the last row and column', () => {
    expect(clampCell(cell(12, 9), 10, 5)).toEqual(cell(9, 4));
  });

  it('pulls negative values up to 0', () => {
    expect(clampCell(cell(-3, -1), 10, 5)).toEqual(cell(0, 0));
  });

  it('clamps rows and columns independently', () => {
    expect(clampCell(cell(50, 1), 10, 5)).toEqual(cell(9, 1));
    expect(clampCell(cell(1, 50), 10, 5)).toEqual(cell(1, 4));
  });

  it('answers 0,0 when there are no rows or no columns', () => {
    expect(clampCell(cell(4, 4), 0, 0)).toEqual(cell(0, 0));
    expect(clampCell(cell(4, 4), 0, 5)).toEqual(cell(0, 4));
    expect(clampCell(cell(4, 4), 5, 0)).toEqual(cell(4, 0));
  });

  it('keeps a 1x1 grid at 0,0', () => {
    expect(clampCell(cell(9, 9), 1, 1)).toEqual(cell(0, 0));
  });
});

describe('wholeRows', () => {
  it('spans every column for the given rows', () => {
    expect(wholeRows(2, 4, 6)).toEqual(range(2, 0, 4, 5));
  });

  it('accepts the rows in either order', () => {
    expect(wholeRows(4, 2, 6)).toEqual(range(2, 0, 4, 5));
  });

  it('works for one row', () => {
    expect(wholeRows(3, 3, 2)).toEqual(range(3, 0, 3, 1));
  });

  it('keeps c0 <= c1 when there are no columns', () => {
    expect(wholeRows(1, 2, 0)).toEqual(range(1, 0, 2, 0));
  });
});

describe('wholeGrid', () => {
  it('covers every cell', () => {
    expect(wholeGrid(10, 4)).toEqual(range(0, 0, 9, 3));
  });

  it('works for a 1x1 grid', () => {
    expect(wholeGrid(1, 1)).toEqual(range(0, 0, 0, 0));
  });

  it('is null when either count is 0', () => {
    expect(wholeGrid(0, 4)).toBeNull();
    expect(wholeGrid(4, 0)).toBeNull();
    expect(wholeGrid(0, 0)).toBeNull();
  });
});

describe('indexesBetween', () => {
  it('lists every index inclusively, ascending', () => {
    expect(indexesBetween(2, 5)).toEqual([2, 3, 4, 5]);
  });

  it('gives the same list when the ends are reversed', () => {
    expect(indexesBetween(5, 2)).toEqual([2, 3, 4, 5]);
  });

  it('gives one index when the ends are equal', () => {
    expect(indexesBetween(7, 7)).toEqual([7]);
  });

  it('handles 10,000 rows', () => {
    const all = indexesBetween(0, 9999);
    expect(all).toHaveLength(10000);
    expect(all[0]).toBe(0);
    expect(all[9999]).toBe(9999);
  });
});

describe('toggleIndex', () => {
  it('adds a missing index in sorted position', () => {
    expect(toggleIndex([1, 3, 5], 4)).toEqual([1, 3, 4, 5]);
    expect(toggleIndex([1, 3, 5], 0)).toEqual([0, 1, 3, 5]);
    expect(toggleIndex([1, 3, 5], 9)).toEqual([1, 3, 5, 9]);
  });

  it('removes an index that is there', () => {
    expect(toggleIndex([1, 3, 5], 3)).toEqual([1, 5]);
    expect(toggleIndex([1, 3, 5], 1)).toEqual([3, 5]);
    expect(toggleIndex([1, 3, 5], 5)).toEqual([1, 3]);
  });

  it('works on an empty list and can empty a list', () => {
    expect(toggleIndex([], 2)).toEqual([2]);
    expect(toggleIndex([2], 2)).toEqual([]);
  });

  it('toggling twice gives the original list', () => {
    const start = [2, 4, 8];
    expect(toggleIndex(toggleIndex(start, 6), 6)).toEqual(start);
  });

  it('returns a new array and leaves the input alone', () => {
    const start = [1, 2];
    const out = toggleIndex(start, 2);
    expect(start).toEqual([1, 2]);
    expect(out).not.toBe(start);
    expect(toggleIndex([1, 2], 9)).not.toBe(start);
  });

  it('stays sorted and unique over many toggles', () => {
    let list: number[] = [];
    for (const i of [9, 3, 7, 3, 1, 9, 5, 5, 5]) list = toggleIndex(list, i);
    expect(list).toEqual([1, 5, 7]);
  });
});

describe('targetRows', () => {
  it('prefers the checked rows, sorted and unique', () => {
    expect(targetRows([5, 2, 5, 9], range(0, 0, 3, 3), 1)).toEqual([2, 5, 9]);
  });

  it('prefers the checked rows over a null range', () => {
    expect(targetRows([4], null, 1)).toEqual([4]);
  });

  it('uses the rows the range spans when nothing is checked', () => {
    expect(targetRows([], range(2, 1, 4, 3), 9)).toEqual([2, 3, 4]);
  });

  it('uses one row for a single cell range', () => {
    expect(targetRows([], range(6, 2, 6, 2), 0)).toEqual([6]);
  });

  it('falls back to the active row with no checks and no range', () => {
    expect(targetRows([], null, 8)).toEqual([8]);
  });

  it('does not hand back the checked array itself', () => {
    const checked = [1, 2];
    expect(targetRows(checked, null, 0)).not.toBe(checked);
  });
});

describe('describeSelection', () => {
  const columns = ['Name', 'City', 'Zip', 'Country'];

  it('counts checked rows, singular and plural', () => {
    expect(describeSelection([4], null, columns)).toBe('1 row selected');
    expect(describeSelection([1, 2, 3], null, columns)).toBe('3 rows selected');
  });

  it('lets checked rows win over a range', () => {
    expect(describeSelection([1, 2], range(0, 0, 9, 3), columns)).toBe('2 rows selected');
  });

  it('is empty with no range and no checked rows', () => {
    expect(describeSelection([], null, columns)).toBe('');
  });

  it('names a single cell with a 1 based row and the column name', () => {
    expect(describeSelection([], range(2, 0, 2, 0), columns)).toBe('Row 3, Name');
    expect(describeSelection([], range(0, 3, 0, 3), columns)).toBe('Row 1, Country');
  });

  it('falls back to "column N" when the column name is missing or blank', () => {
    expect(describeSelection([], range(2, 1, 2, 1), ['A'])).toBe('Row 3, column 2');
    expect(describeSelection([], range(2, 1, 2, 1), ['A', ''])).toBe('Row 3, column 2');
    expect(describeSelection([], range(0, 0, 0, 0), [])).toBe('Row 1, column 1');
  });

  it('describes one row and several columns', () => {
    expect(describeSelection([], range(2, 0, 2, 3), columns)).toBe('Row 3, 4 columns');
    expect(describeSelection([], range(2, 1, 2, 2), columns)).toBe('Row 3, 2 columns');
  });

  it('describes several rows and one column by the column name', () => {
    expect(describeSelection([], range(0, 0, 4, 0), columns)).toBe('5 rows, Name');
    expect(describeSelection([], range(0, 2, 1, 2), columns)).toBe('2 rows, Zip');
    expect(describeSelection([], range(0, 5, 1, 5), columns)).toBe('2 rows, column 6');
  });

  it('describes several rows and several columns', () => {
    expect(describeSelection([], range(0, 0, 4, 3), columns)).toBe('5 rows, 4 columns');
    expect(describeSelection([], range(3, 1, 4, 2), columns)).toBe('2 rows, 2 columns');
  });

  it('works for the whole of a large grid', () => {
    expect(describeSelection([], range(0, 0, 9999, 19), columns)).toBe('10,000 rows, 20 columns');
  });

  it('works with a range made from reversed corners', () => {
    const r = normalizeRange(cell(4, 3), cell(0, 0));
    expect(describeSelection([], r, columns)).toBe('5 rows, 4 columns');
  });
});
