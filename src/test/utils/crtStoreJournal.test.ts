/**
 * @file crtStoreJournal.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Tests for the change journal of the cross reference table store: undo and redo of every
 * kind of change, labels, row id stability, edit tracking, the redo stack, fresh history
 * after override and reset, batches, the memory caps, exact net dirtiness, regions, a seeded
 * randomized model test, and timings on a 10,000 row by 20 column table.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  CRT_MAX_HISTORY_CELLS,
  CRT_MAX_HISTORY_ENTRIES,
  createCrtStore,
  type CrtHistoryResult,
} from '../../utils/crt/crtStore';
import type { CrtTableData } from '../../utils/crt/crtTypes';

type Store = ReturnType<typeof createCrtStore>;

const makeTable = (patch: Partial<CrtTableData> = {}): CrtTableData => ({
  id: 'table-1',
  name: 'Country codes',
  processId: 'process-1',
  processName: 'Process one',
  matchType: 'exact',
  columns: ['Code', 'Name', 'Region'],
  defaultRows: [
    ['A', 'Alpha', 'EU'],
    ['B', 'Beta', 'US'],
    ['C', 'Gamma', 'APAC'],
  ],
  overrideRows: null,
  ...patch,
});

/** Four rows of three columns, overridden at load, easy to tell apart. */
const makeFour = (): CrtTableData =>
  makeTable({
    overrideRows: [
      ['A0', 'a1', 'a2'],
      ['B0', 'b1', 'b2'],
      ['C0', 'c1', 'c2'],
      ['D0', 'd1', 'd2'],
    ],
  });

const FOUR_ROWS = makeFour().overrideRows as string[][];

const bigTable = (rowCount: number, colCount: number): CrtTableData => {
  const columns = Array.from({ length: colCount }, (_, c) => `Col ${c}`);
  const overrideRows = Array.from({ length: rowCount }, (_, r) =>
    Array.from({ length: colCount }, (_, c) => `o${r}-${c}`),
  );
  return makeTable({ columns, defaultRows: [], overrideRows });
};

const allRows = (store: Store): string[][] =>
  Array.from({ length: store.rowCount() }, (_, r) =>
    Array.from({ length: store.colCount() }, (_, c) => store.getCell(r, c)),
  );

const rowIds = (store: Store): number[] => Array.from({ length: store.rowCount() }, (_, r) => store.rowId(r));

const firstColumn = (store: Store): string[] => allRows(store).map((row) => row[0]);

const editedCells = (store: Store): string[] => {
  const out: string[] = [];
  for (let r = 0; r < store.rowCount(); r++) {
    for (let c = 0; c < store.colCount(); c++) {
      if (store.isCellEdited(r, c)) out.push(`${r}:${c}`);
    }
  }
  return out;
};

const newRows = (store: Store): boolean[] => Array.from({ length: store.rowCount() }, (_, r) => store.isRowNew(r));

const listen = (store: Store): ReturnType<typeof vi.fn> => {
  const listener = vi.fn();
  store.subscribe(listener);
  return listener;
};

const undoAll = (store: Store): number => {
  let count = 0;
  while (store.undo() !== null) count += 1;
  return count;
};

const redoAll = (store: Store): number => {
  let count = 0;
  while (store.redo() !== null) count += 1;
  return count;
};

const region = (r0: number, c0: number, r1: number, c1: number): CrtHistoryResult['region'] => ({ r0, c0, r1, c1 });

describe('journal: nothing to undo', () => {
  it('starts empty on a loaded override', () => {
    const store = createCrtStore(makeFour());
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    expect(store.undoLabel()).toBeNull();
    expect(store.redoLabel()).toBeNull();
  });

  it('answers null without a notification or a version bump', () => {
    const store = createCrtStore(makeFour());
    const listener = listen(store);
    expect(store.undo()).toBeNull();
    expect(store.redo()).toBeNull();
    expect(store.version()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('is empty and inert on a read only store', () => {
    const table = makeTable();
    const store = createCrtStore(table);
    const listener = listen(store);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    expect(store.undoLabel()).toBeNull();
    expect(store.redoLabel()).toBeNull();
    expect(store.undo()).toBeNull();
    expect(store.redo()).toBeNull();
    expect(store.version()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    expect(allRows(store)).toEqual(table.defaultRows);
  });

  it('journals nothing for calls that change nothing', () => {
    const store = createCrtStore(makeFour());
    const listener = listen(store);
    store.setCell(0, 0, 'A0');
    store.setCell(9, 0, 'x');
    store.insertRows(9, [['n', '', '']]);
    store.insertRows(0, []);
    store.deleteRows([]);
    store.deleteRows([9]);
    store.moveRows([0], -1);
    store.moveRows([3], 1);
    store.moveRows([], 1);
    store.setCells(0, 0, [['A0', 'a1']]);
    store.setCells(0, 0, []);
    store.setCells(9, 0, [['x']], true);
    store.fillCells(0, 0, 0, 0, 'A0');
    store.fillCells(9, 9, 9, 9, 'x');
    expect(store.canUndo()).toBe(false);
    expect(store.version()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('journals nothing when growing is refused because of the row limit', () => {
    const rows = Array.from({ length: 9999 }, (_, r) => [`r${r}`, '', '']);
    const store = createCrtStore(makeTable({ overrideRows: rows }));
    const result = store.setCells(9998, 0, [['a'], ['b'], ['c']], true);
    expect(result?.overflow).toBe(true);
    expect(store.canUndo()).toBe(false);
    expect(store.version()).toBe(0);
  });
});

describe('journal: setCell', () => {
  it('undoes and redoes one edit', () => {
    const store = createCrtStore(makeFour());
    store.setCell(1, 1, 'new');
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(false);
    expect(store.undoLabel()).toBe('Edit cell');
    expect(store.redoLabel()).toBeNull();

    expect(store.undo()).toEqual({ label: 'Edit cell', region: region(1, 1, 1, 1) });
    expect(store.getCell(1, 1)).toBe('b1');
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(true);
    expect(store.redoLabel()).toBe('Edit cell');
    expect(store.undoLabel()).toBeNull();

    expect(store.redo()).toEqual({ label: 'Edit cell', region: region(1, 1, 1, 1) });
    expect(store.getCell(1, 1)).toBe('new');
    expect(store.canRedo()).toBe(false);
  });

  it('is one step per edit, undone newest first', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'one');
    store.setCell(0, 0, 'two');
    store.setCell(0, 0, 'three');
    store.undo();
    expect(store.getCell(0, 0)).toBe('two');
    store.undo();
    expect(store.getCell(0, 0)).toBe('one');
    store.undo();
    expect(store.getCell(0, 0)).toBe('A0');
    store.redo();
    store.redo();
    expect(store.getCell(0, 0)).toBe('two');
  });

  it('undoes an edit to an empty string and back', () => {
    const store = createCrtStore(makeFour());
    store.setCell(2, 2, '');
    store.undo();
    expect(store.getCell(2, 2)).toBe('c2');
    store.redo();
    expect(store.getCell(2, 2)).toBe('');
  });
});

describe('journal: setCells', () => {
  it('undoes a block write without growth as one step', () => {
    const store = createCrtStore(makeFour());
    store.setCells(1, 1, [['p', 'q'], ['r', 's']]);
    expect(store.undoLabel()).toBe('Edit 4 cells');
    expect(store.undo()).toEqual({ label: 'Edit 4 cells', region: region(1, 1, 2, 2) });
    expect(allRows(store)).toEqual(FOUR_ROWS);
    store.redo();
    expect(allRows(store)[1]).toEqual(['B0', 'p', 'q']);
    expect(allRows(store)[2]).toEqual(['C0', 'r', 's']);
  });

  it('covers only the cells that changed in the region', () => {
    const store = createCrtStore(makeFour());
    store.setCells(0, 0, [['A0', 'new'], ['B0', 'b1']]);
    expect(store.undoLabel()).toBe('Edit cell');
    expect(store.undo()?.region).toEqual(region(0, 1, 0, 1));
  });

  it('drops the cells of a write that was cut on the right and still undoes the rest', () => {
    const store = createCrtStore(makeFour());
    store.setCells(0, 1, [['p', 'q', 'cut']]);
    store.undo();
    expect(allRows(store)).toEqual(FOUR_ROWS);
  });

  it('makes a grow ONE step: the appended rows and the written cells', () => {
    const store = createCrtStore(makeFour());
    const listener = listen(store);
    const result = store.setCells(3, 1, [['x1', 'x2'], ['y1', 'y2'], ['z1', 'z2']], true);
    expect(result).toEqual({ changed: 6, added: 2, cutColumns: false, overflow: false });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(1);
    expect(store.undoLabel()).toBe('Edit 6 cells');

    expect(store.undo()).toEqual({ label: 'Edit 6 cells', region: region(3, 0, 3, 2) });
    expect(allRows(store)).toEqual(FOUR_ROWS);
    expect(rowIds(store)).toEqual([0, 1, 2, 3]);
    expect(store.canUndo()).toBe(false);
    expect(store.isDirty()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.version()).toBe(2);

    expect(store.redo()).toEqual({ label: 'Edit 6 cells', region: region(3, 0, 5, 2) });
    expect(allRows(store).slice(3)).toEqual([
      ['D0', 'x1', 'x2'],
      ['', 'y1', 'y2'],
      ['', 'z1', 'z2'],
    ]);
    expect(rowIds(store)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(newRows(store)).toEqual([false, false, false, false, true, true]);
    expect(store.changedCellCount()).toBe(2);
    expect(store.canRedo()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('labels a grow that only appends blank rows as an insert', () => {
    const store = createCrtStore(makeFour());
    store.setCells(3, 0, [['D0'], [''], ['']], true);
    expect(store.undoLabel()).toBe('Insert 2 rows');
    store.undo();
    expect(store.rowCount()).toBe(4);
    store.redo();
    expect(store.rowCount()).toBe(6);
    expect(rowIds(store)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('undoes a grow whose existing cells did not change', () => {
    const store = createCrtStore(makeFour());
    store.setCells(3, 0, [['D0', 'd1'], ['n1', 'n2']], true);
    expect(store.undoLabel()).toBe('Edit 2 cells');
    store.undo();
    expect(allRows(store)).toEqual(FOUR_ROWS);
    store.redo();
    expect(allRows(store)[4]).toEqual(['n1', 'n2', '']);
  });

  it('undoes a grow whose cells are all in appended rows', () => {
    const store = createCrtStore(makeFour());
    store.setCells(3, 0, [['D0', 'd1', 'd2'], ['x', 'y', 'z']], true);
    store.undo();
    expect(rowIds(store)).toEqual([0, 1, 2, 3]);
    store.redo();
    expect(allRows(store)[4]).toEqual(['x', 'y', 'z']);
  });

  it('does not rewind the id counter: a row appended after the undo gets a new id', () => {
    const store = createCrtStore(makeFour());
    store.setCells(3, 0, [['D0'], ['x']], true);
    expect(store.rowId(4)).toBe(4);
    store.undo();
    store.setCells(3, 0, [['D0'], ['y']], true);
    expect(store.rowId(4)).toBe(5);
  });
});

describe('journal: fillCells', () => {
  it('undoes a fill as one step, with the number of cells that changed in the label', () => {
    const store = createCrtStore(makeFour());
    store.fillCells(1, 1, 2, 2, 'z');
    expect(store.undoLabel()).toBe('Edit 4 cells');
    expect(store.undo()).toEqual({ label: 'Edit 4 cells', region: region(1, 1, 2, 2) });
    expect(allRows(store)).toEqual(FOUR_ROWS);
    expect(store.redo()?.region).toEqual(region(1, 1, 2, 2));
    expect(store.getCell(2, 2)).toBe('z');
  });

  it('counts only changed cells in the label', () => {
    const store = createCrtStore(makeFour());
    store.fillCells(0, 0, 1, 0, 'A0');
    expect(store.undoLabel()).toBe('Edit cell');
  });

  it('undoes a fill with an empty string', () => {
    const store = createCrtStore(makeFour());
    store.fillCells(0, 0, 0, 2, '');
    store.undo();
    expect(allRows(store)[0]).toEqual(['A0', 'a1', 'a2']);
  });
});

describe('journal: insertRows', () => {
  it('undoes an insert by removing the rows and redoes it with the same ids', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(1, [['N1', 'x', 'y'], ['N2', 'x', 'y']]);
    expect(store.undoLabel()).toBe('Insert 2 rows');
    expect(rowIds(store)).toEqual([0, 4, 5, 1, 2, 3]);

    expect(store.undo()).toEqual({ label: 'Insert 2 rows', region: region(1, 0, 1, 2) });
    expect(allRows(store)).toEqual(FOUR_ROWS);
    expect(rowIds(store)).toEqual([0, 1, 2, 3]);

    expect(store.redo()).toEqual({ label: 'Insert 2 rows', region: region(1, 0, 2, 2) });
    expect(firstColumn(store)).toEqual(['A0', 'N1', 'N2', 'B0', 'C0', 'D0']);
    expect(rowIds(store)).toEqual([0, 4, 5, 1, 2, 3]);
  });

  it('undoes an append at the end and an insert at the top', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(4, [['END', '', '']]);
    store.insertRows(0, [['TOP', '', '']]);
    store.undo();
    expect(firstColumn(store)).toEqual(['A0', 'B0', 'C0', 'D0', 'END']);
    store.undo();
    expect(firstColumn(store)).toEqual(['A0', 'B0', 'C0', 'D0']);
    redoAll(store);
    expect(firstColumn(store)).toEqual(['TOP', 'A0', 'B0', 'C0', 'D0', 'END']);
    expect(rowIds(store)).toEqual([5, 0, 1, 2, 3, 4]);
  });

  it('restores the content of an inserted row that was edited later', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(0, [['N', 'n1', 'n2']]);
    store.setCell(0, 1, 'changed');
    store.undo();
    expect(store.getCell(0, 1)).toBe('n1');
    store.undo();
    expect(store.rowCount()).toBe(4);
    store.redo();
    expect(allRows(store)[0]).toEqual(['N', 'n1', 'n2']);
    store.redo();
    expect(allRows(store)[0]).toEqual(['N', 'changed', 'n2']);
  });

  it('keeps a row inserted from short or long input padded and cut across undo and redo', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(0, [['short'], ['a', 'b', 'c', 'd']]);
    undoAll(store);
    redoAll(store);
    expect(allRows(store).slice(0, 2)).toEqual([
      ['short', '', ''],
      ['a', 'b', 'c'],
    ]);
  });

  it('does not let a caller change the stored rows through the array it passed', () => {
    const store = createCrtStore(makeFour());
    const given = [['N', 'x', 'y']];
    store.insertRows(0, given);
    given[0][0] = 'outside';
    store.undo();
    store.redo();
    expect(store.getCell(0, 0)).toBe('N');
  });

  it('undoes an insert into an empty table', () => {
    const store = createCrtStore(makeTable({ overrideRows: [] }));
    store.insertRows(0, [['only', '', '']]);
    expect(store.undo()).toEqual({ label: 'Insert row', region: null });
    expect(store.rowCount()).toBe(0);
    expect(store.redo()?.region).toEqual(region(0, 0, 0, 2));
    expect(store.getCell(0, 0)).toBe('only');
  });
});

describe('journal: deleteRows', () => {
  it('undoes a delete by bringing the rows back at their positions with their old ids', () => {
    const store = createCrtStore(makeFour());
    store.deleteRows([1, 3]);
    expect(store.undoLabel()).toBe('Delete 2 rows');
    expect(firstColumn(store)).toEqual(['A0', 'C0']);

    expect(store.undo()).toEqual({ label: 'Delete 2 rows', region: region(1, 0, 3, 2) });
    expect(allRows(store)).toEqual(FOUR_ROWS);
    expect(rowIds(store)).toEqual([0, 1, 2, 3]);

    expect(store.redo()?.label).toBe('Delete 2 rows');
    expect(firstColumn(store)).toEqual(['A0', 'C0']);
    expect(rowIds(store)).toEqual([0, 2]);
  });

  it('undoes the removal of every row', () => {
    const store = createCrtStore(makeFour());
    store.deleteRows([0, 1, 2, 3]);
    expect(store.undo()?.region).toEqual(region(0, 0, 3, 2));
    expect(allRows(store)).toEqual(FOUR_ROWS);
    expect(store.redo()).toEqual({ label: 'Delete 4 rows', region: null });
    expect(store.rowCount()).toBe(0);
  });

  it('undoes the removal of the first and of the last row', () => {
    const store = createCrtStore(makeFour());
    store.deleteRows([0]);
    store.deleteRows([2]);
    expect(firstColumn(store)).toEqual(['B0', 'C0']);
    store.undo();
    expect(firstColumn(store)).toEqual(['B0', 'C0', 'D0']);
    store.undo();
    expect(firstColumn(store)).toEqual(['A0', 'B0', 'C0', 'D0']);
    expect(rowIds(store)).toEqual([0, 1, 2, 3]);
  });

  it('restores the rows with the content they had, edits included', () => {
    const store = createCrtStore(makeFour());
    store.setCell(1, 1, 'edited');
    store.deleteRows([1]);
    store.undo();
    expect(store.getCell(1, 1)).toBe('edited');
    store.undo();
    expect(store.getCell(1, 1)).toBe('b1');
  });

  it('restores rows that were inserted earlier, with their ids and as new rows', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(2, [['N1', '', ''], ['N2', '', '']]);
    store.deleteRows([2, 3]);
    expect(rowIds(store)).toEqual([0, 1, 2, 3]);
    store.undo();
    expect(rowIds(store)).toEqual([0, 1, 4, 5, 2, 3]);
    expect(newRows(store)).toEqual([false, false, true, true, false, false]);
  });
});

describe('journal: moveRows', () => {
  const sixRows = (): Store =>
    createCrtStore(makeTable({ overrideRows: ['A', 'B', 'C', 'D', 'E', 'F'].map((v) => [v, '', '']) }));

  it('undoes a move up and a move down by moving the other way', () => {
    const store = sixRows();
    store.moveRows([2], -1);
    expect(store.undoLabel()).toBe('Move row');
    expect(store.undo()).toEqual({ label: 'Move row', region: region(2, 0, 2, 2) });
    expect(firstColumn(store)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(store.redo()?.region).toEqual(region(1, 0, 1, 2));
    expect(firstColumn(store)).toEqual(['A', 'C', 'B', 'D', 'E', 'F']);

    const down = sixRows();
    down.moveRows([2], 1);
    down.undo();
    expect(firstColumn(down)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    down.redo();
    expect(firstColumn(down)).toEqual(['A', 'B', 'D', 'C', 'E', 'F']);
  });

  it('undoes blocks and split selections in both directions, ids included', () => {
    const cases: Array<[number[], -1 | 1]> = [
      [[2, 3, 4], -1],
      [[1, 2, 3], 1],
      [[1, 4], -1],
      [[1, 4], 1],
      [[0, 1], 1],
      [[4, 5], -1],
      [[1, 3], 1],
      [[0, 2, 4], 1],
      [[1, 3, 5], -1],
    ];
    for (const [indexes, delta] of cases) {
      const store = sixRows();
      store.moveRows(indexes, delta);
      const moved = { rows: allRows(store), ids: rowIds(store) };
      expect(store.undo()?.label).toBe(indexes.length === 1 ? 'Move row' : `Move ${indexes.length} rows`);
      expect(firstColumn(store)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
      expect(rowIds(store)).toEqual([0, 1, 2, 3, 4, 5]);
      store.redo();
      expect({ rows: allRows(store), ids: rowIds(store) }).toEqual(moved);
    }
  });

  it('reports the moved rows in the region after undo and after redo', () => {
    const store = sixRows();
    store.moveRows([1, 2], 1);
    expect(store.undo()?.region).toEqual(region(1, 0, 2, 2));
    expect(store.redo()?.region).toEqual(region(2, 0, 3, 2));
  });

  it('moves the edit tracking with the row, also through undo and redo', () => {
    const store = sixRows();
    store.setCell(3, 1, 'edited');
    store.moveRows([3], -1);
    expect(editedCells(store)).toEqual(['2:1']);
    store.undo();
    expect(editedCells(store)).toEqual(['3:1']);
    store.redo();
    expect(editedCells(store)).toEqual(['2:1']);
  });
});

describe('journal: labels', () => {
  it('use the singular for one and a count for more', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'x');
    expect(store.undoLabel()).toBe('Edit cell');
    store.fillCells(0, 0, 0, 2, 'y');
    expect(store.undoLabel()).toBe('Edit 3 cells');
    store.insertRows(0, [['a', '', '']]);
    expect(store.undoLabel()).toBe('Insert row');
    store.insertRows(0, [['a', '', ''], ['b', '', '']]);
    expect(store.undoLabel()).toBe('Insert 2 rows');
    store.deleteRows([0]);
    expect(store.undoLabel()).toBe('Delete row');
    store.deleteRows([0, 1, 2]);
    expect(store.undoLabel()).toBe('Delete 3 rows');
    store.moveRows([1], 1);
    expect(store.undoLabel()).toBe('Move row');
    store.moveRows([0, 1], 1);
    expect(store.undoLabel()).toBe('Move 2 rows');
  });

  it('group thousands like the rest of the editor text', () => {
    const store = createCrtStore(bigTable(1500, 2));
    store.fillCells(0, 0, 1499, 1, 'z');
    expect(store.undoLabel()).toBe('Edit 3,000 cells');
  });

  it('follow the step through undo and redo', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'x');
    store.deleteRows([1, 2]);
    expect(store.undoLabel()).toBe('Delete 2 rows');
    expect(store.redoLabel()).toBeNull();
    store.undo();
    expect(store.undoLabel()).toBe('Edit cell');
    expect(store.redoLabel()).toBe('Delete 2 rows');
    store.undo();
    expect(store.undoLabel()).toBeNull();
    expect(store.redoLabel()).toBe('Edit cell');
  });
});

describe('journal: row ids and the order of undo', () => {
  it('lets later entries refer to rows that an earlier entry created', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(0, [['N', 'n1', 'n2']]); // id 4
    store.setCell(0, 1, 'edited'); // refers to id 4
    store.moveRows([0], 1); // id 4 moves to index 1
    store.deleteRows([1]); // removes id 4
    const states: Array<{ rows: string[][]; ids: number[] }> = [];
    // Walk back to the start, then forward again, comparing each state with the one seen on the way.
    const forward = [{ rows: allRows(store), ids: rowIds(store) }];
    while (store.undo() !== null) forward.push({ rows: allRows(store), ids: rowIds(store) });
    expect(forward).toHaveLength(5);
    expect(forward[4]).toEqual({ rows: FOUR_ROWS, ids: [0, 1, 2, 3] });
    while (store.redo() !== null) states.push({ rows: allRows(store), ids: rowIds(store) });
    expect(states).toEqual([forward[3], forward[2], forward[1], forward[0]]);
  });

  it('undoes a delete before the insert that created the rows, and the ids line up', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(1, [['N1', '', ''], ['N2', '', '']]);
    store.deleteRows([1]);
    store.undo();
    expect(rowIds(store)).toEqual([0, 4, 5, 1, 2, 3]);
    store.undo();
    expect(rowIds(store)).toEqual([0, 1, 2, 3]);
    store.redo();
    store.redo();
    expect(rowIds(store)).toEqual([0, 5, 1, 2, 3]);
  });

  it('never reuses or rewinds an id, whatever is undone', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(0, [['a', '', '']]); // 4
    store.insertRows(0, [['b', '', '']]); // 5
    undoAll(store);
    store.insertRows(0, [['c', '', '']]);
    expect(store.rowId(0)).toBe(6);
    // The redo stack was dropped, so the earlier ids can not come back.
    expect(store.canRedo()).toBe(false);
  });

  it('keeps ids unique and stable through a long mixed walk', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(2, [['N1', '', ''], ['N2', '', '']]);
    store.deleteRows([0]);
    store.moveRows([2], -1);
    store.setCells(store.rowCount() - 1, 0, [['T1'], ['T2']], true);
    const final = rowIds(store);
    undoAll(store);
    expect(rowIds(store)).toEqual([0, 1, 2, 3]);
    redoAll(store);
    expect(rowIds(store)).toEqual(final);
    expect(new Set(final).size).toBe(final.length);
  });
});

describe('journal: edit tracking after undo and redo', () => {
  it('clears the mark when an edit is undone and sets it when it is redone', () => {
    const store = createCrtStore(makeFour());
    store.setCell(1, 2, 'edited');
    store.undo();
    expect(editedCells(store)).toEqual([]);
    expect(store.changedCellCount()).toBe(0);
    store.redo();
    expect(editedCells(store)).toEqual(['1:2']);
    expect(store.changedCellCount()).toBe(1);
  });

  it('marks the cell again when the undo of a revert brings the edit back', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'edited');
    store.setCell(0, 0, 'A0');
    expect(store.isCellEdited(0, 0)).toBe(false);
    store.undo();
    expect(store.getCell(0, 0)).toBe('edited');
    expect(store.isCellEdited(0, 0)).toBe(true);
    store.undo();
    expect(store.isCellEdited(0, 0)).toBe(false);
    store.redo();
    store.redo();
    expect(store.isCellEdited(0, 0)).toBe(false);
    expect(store.changedCellCount()).toBe(0);
  });

  it('keeps the first original value across several edits, undone one by one', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'one');
    store.setCell(0, 0, 'two');
    store.undo();
    expect(store.isCellEdited(0, 0)).toBe(true);
    expect(store.changedCellCount()).toBe(1);
    // Still the original A0 underneath: setting it back clears the mark.
    store.setCell(0, 0, 'A0');
    expect(store.isCellEdited(0, 0)).toBe(false);
  });

  it('puts back the edit tracking that a delete dropped, and drops it again on redo', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'e0');
    store.setCell(1, 1, 'e1');
    store.setCell(1, 2, 'e2');
    store.setCell(3, 0, 'e3');
    expect(store.changedCellCount()).toBe(4);

    store.deleteRows([1, 3]);
    expect(store.changedCellCount()).toBe(1);
    expect(editedCells(store)).toEqual(['0:0']);

    store.undo();
    expect(store.changedCellCount()).toBe(4);
    expect(editedCells(store)).toEqual(['0:0', '1:1', '1:2', '3:0']);

    store.redo();
    expect(store.changedCellCount()).toBe(1);
    expect(editedCells(store)).toEqual(['0:0']);

    store.undo();
    // The restored rows still remember their original values.
    store.setCell(1, 1, 'b1');
    expect(store.isCellEdited(1, 1)).toBe(false);
    expect(store.changedCellCount()).toBe(3);
  });

  it('puts back the first original value of a cell that was edited twice before its row was deleted', () => {
    const store = createCrtStore(makeFour());
    store.setCell(2, 0, 'mid');
    store.setCell(2, 0, 'last');
    store.deleteRows([2]);
    store.undo();
    store.setCell(2, 0, 'C0');
    expect(store.isCellEdited(2, 0)).toBe(false);
  });

  it('keeps tracking correct after inserts, deletes and moves are undone around an edit', () => {
    const store = createCrtStore(makeFour());
    store.setCell(3, 0, 'edited');
    store.insertRows(0, [['n', '', '']]);
    store.deleteRows([1]);
    store.moveRows([3], -1);
    expect(editedCells(store)).toEqual(['2:0']);
    store.undo();
    expect(editedCells(store)).toEqual(['3:0']);
    store.undo();
    expect(editedCells(store)).toEqual(['4:0']);
    store.undo();
    expect(editedCells(store)).toEqual(['3:0']);
    store.undo();
    expect(editedCells(store)).toEqual([]);
  });

  it('reports isRowNew correctly after undo and redo', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(1, [['N1', '', ''], ['N2', '', '']]);
    expect(newRows(store)).toEqual([false, true, true, false, false, false]);
    store.undo();
    expect(newRows(store)).toEqual([false, false, false, false]);
    store.redo();
    expect(newRows(store)).toEqual([false, true, true, false, false, false]);
    store.deleteRows([1]);
    store.undo();
    expect(newRows(store)).toEqual([false, true, true, false, false, false]);
  });

  it('does not track cells of new rows through undo and redo', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(0, [['n', 'n', 'n']]);
    store.setCell(0, 0, 'x');
    expect(editedCells(store)).toEqual([]);
    store.undo();
    store.redo();
    expect(store.getCell(0, 0)).toBe('x');
    expect(editedCells(store)).toEqual([]);
    expect(store.changedCellCount()).toBe(0);
  });
});

describe('journal: the redo stack', () => {
  it('is cleared by a new change after an undo', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'one');
    store.setCell(0, 0, 'two');
    store.undo();
    expect(store.canRedo()).toBe(true);
    store.setCell(1, 1, 'other');
    expect(store.canRedo()).toBe(false);
    expect(store.redo()).toBeNull();
    expect(store.getCell(0, 0)).toBe('one');
  });

  it('is cleared by every kind of change', () => {
    const changes: Array<(store: Store) => void> = [
      (s) => s.setCell(1, 1, 'x'),
      (s) => s.setCells(1, 0, [['x']]),
      (s) => s.fillCells(1, 0, 1, 0, 'x'),
      (s) => s.insertRows(0, [['n', '', '']]),
      (s) => s.deleteRows([1]),
      (s) => s.moveRows([1], 1),
      (s) => s.batch(() => s.setCell(1, 1, 'x')),
    ];
    for (const change of changes) {
      const store = createCrtStore(makeFour());
      store.setCell(0, 0, 'edited');
      store.undo();
      expect(store.canRedo()).toBe(true);
      change(store);
      expect(store.canRedo()).toBe(false);
    }
  });

  it('survives calls that change nothing', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'edited');
    store.undo();
    store.setCell(0, 0, 'A0');
    store.deleteRows([]);
    store.moveRows([0], -1);
    store.batch(() => undefined);
    store.batch(() => store.setCell(0, 0, 'A0'));
    expect(store.canRedo()).toBe(true);
    store.redo();
    expect(store.getCell(0, 0)).toBe('edited');
  });

  it('can be walked: undo twice, redo twice, undo once, redo once', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'one');
    store.setCell(0, 0, 'two');
    store.undo();
    store.undo();
    store.redo();
    store.redo();
    expect(store.getCell(0, 0)).toBe('two');
    store.undo();
    expect(store.getCell(0, 0)).toBe('one');
    store.redo();
    expect(store.getCell(0, 0)).toBe('two');
    expect(store.canRedo()).toBe(false);
  });
});

describe('journal: notifications and versions', () => {
  it('notify exactly once and bump the version once for each undo and redo', () => {
    const store = createCrtStore(makeFour());
    store.setCells(0, 0, [['a', 'b', 'c'], ['d', 'e', 'f']]);
    store.deleteRows([0, 1, 2]);
    const listener = listen(store);
    const version = store.version();

    store.undo();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(version + 1);
    store.undo();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.version()).toBe(version + 2);
    store.redo();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(store.version()).toBe(version + 3);
    store.redo();
    expect(listener).toHaveBeenCalledTimes(4);
    expect(store.version()).toBe(version + 4);
  });

  it('do not notify when there is nothing to do', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'x');
    store.undo();
    const listener = listen(store);
    const version = store.version();
    store.undo();
    store.redo();
    store.redo();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(version + 1);
  });

  it('show listeners the finished state, with the history flags already updated', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'x');
    const seen: Array<{ value: string; canUndo: boolean; canRedo: boolean; version: number }> = [];
    store.subscribe(() => {
      seen.push({
        value: store.getCell(0, 0),
        canUndo: store.canUndo(),
        canRedo: store.canRedo(),
        version: store.version(),
      });
    });
    store.undo();
    store.redo();
    expect(seen).toEqual([
      { value: 'A0', canUndo: false, canRedo: true, version: 2 },
      { value: 'x', canUndo: true, canRedo: false, version: 3 },
    ]);
  });

  it('show listeners the new step after an ordinary change', () => {
    const store = createCrtStore(makeFour());
    const seen: Array<string | null> = [];
    store.subscribe(() => seen.push(store.undoLabel()));
    store.deleteRows([0, 1]);
    store.insertRows(0, [['n', '', '']]);
    expect(seen).toEqual(['Delete 2 rows', 'Insert row']);
  });
});

describe('journal: override() and reset() start a fresh history', () => {
  it('override() on a read only store starts empty and keeps no step from before', () => {
    const store = createCrtStore(makeTable());
    store.override();
    expect(store.canUndo()).toBe(false);
    expect(store.undo()).toBeNull();
    store.setCell(0, 0, 'edited');
    expect(store.canUndo()).toBe(true);
  });

  it('reset() clears both stacks and they stay empty through the next override()', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'one');
    store.setCell(0, 0, 'two');
    store.undo();
    expect(store.canUndo()).toBe(true);
    expect(store.canRedo()).toBe(true);

    store.reset();
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    expect(store.undoLabel()).toBeNull();
    expect(store.redoLabel()).toBeNull();
    expect(store.undo()).toBeNull();
    expect(store.redo()).toBeNull();

    store.override();
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    expect(allRows(store)).toEqual(makeFour().defaultRows);
  });

  it('override() and reset() are not undoable steps', () => {
    const store = createCrtStore(makeTable());
    store.override();
    store.setCell(0, 0, 'edited');
    store.undo();
    expect(store.isOverridden()).toBe(true);
    expect(store.undo()).toBeNull();
    store.reset();
    expect(store.isOverridden()).toBe(false);
    expect(store.undo()).toBeNull();
    expect(store.redo()).toBeNull();
  });

  it('a call to override() on an override does not clear the history', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'edited');
    store.override();
    expect(store.canUndo()).toBe(true);
  });

  it('a call to reset() on a read only store does not touch anything', () => {
    const store = createCrtStore(makeTable());
    const listener = listen(store);
    store.reset();
    expect(listener).not.toHaveBeenCalled();
  });

  it('works on the fresh rows: ids restart and undo only reaches changes made afterwards', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(0, [['n', '', '']]);
    store.reset();
    store.override();
    store.insertRows(0, [['m', '', '']]);
    expect(rowIds(store)).toEqual([3, 0, 1, 2]);
    store.undo();
    expect(rowIds(store)).toEqual([0, 1, 2]);
    expect(store.undo()).toBeNull();
    expect(store.isDirty()).toBe(true);
  });

  it('keeps isDirty true after override() whatever the history says', () => {
    const store = createCrtStore(makeTable());
    store.override();
    store.setCell(0, 0, 'edited');
    store.undo();
    expect(store.isDirty()).toBe(true);
  });
});

describe('journal: batch', () => {
  it('turns every change inside it into ONE undo step and ONE notification', () => {
    const store = createCrtStore(makeFour());
    const listener = listen(store);
    const result = store.batch(() => {
      store.setCell(0, 0, 'x');
      store.insertRows(1, [['N', '', '']]);
      store.deleteRows([3]);
      store.fillCells(0, 1, 0, 2, 'z');
      return 'done';
    }, 'Paste');
    expect(result).toBe('done');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(1);
    expect(store.undoLabel()).toBe('Paste');

    const after = { rows: allRows(store), ids: rowIds(store) };
    expect(store.undo()?.label).toBe('Paste');
    expect(allRows(store)).toEqual(FOUR_ROWS);
    expect(rowIds(store)).toEqual([0, 1, 2, 3]);
    expect(store.canUndo()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    expect(store.redo()?.label).toBe('Paste');
    expect({ rows: allRows(store), ids: rowIds(store) }).toEqual(after);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('holds notifications and the version until the outermost batch ends', () => {
    const store = createCrtStore(makeFour());
    const listener = listen(store);
    store.batch(() => {
      store.setCell(0, 0, 'x');
      expect(listener).not.toHaveBeenCalled();
      expect(store.version()).toBe(0);
      store.batch(() => {
        store.setCell(1, 1, 'y');
        store.moveRows([0], 1);
      });
      expect(listener).not.toHaveBeenCalled();
      expect(store.version()).toBe(0);
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(1);
  });

  it('shows the changes through the store while it runs', () => {
    const store = createCrtStore(makeFour());
    store.batch(() => {
      store.setCell(0, 0, 'x');
      expect(store.getCell(0, 0)).toBe('x');
      expect(store.isDirty()).toBe(true);
      store.setCell(0, 0, 'A0');
      expect(store.isDirty()).toBe(false);
      store.insertRows(0, [['n', '', '']]);
      expect(store.rowCount()).toBe(5);
      expect(store.isDirty()).toBe(true);
      store.deleteRows([0]);
      expect(store.isDirty()).toBe(false);
    });
    expect(store.isDirty()).toBe(false);
  });

  it('lets a nested batch join the outer one, whose label wins', () => {
    const store = createCrtStore(makeFour());
    const listener = listen(store);
    store.batch(() => {
      store.setCell(0, 0, 'x');
      store.batch(() => {
        store.setCell(1, 0, 'y');
        store.batch(() => store.deleteRows([3]), 'Innermost');
      }, 'Inner');
    }, 'Outer');
    expect(store.undoLabel()).toBe('Outer');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(1);
    store.undo();
    expect(allRows(store)).toEqual(FOUR_ROWS);
    expect(store.canUndo()).toBe(false);
  });

  it('does not borrow the label of an inner batch when the outer one has none', () => {
    const store = createCrtStore(makeFour());
    store.batch(() => {
      store.setCell(0, 0, 'x');
      store.batch(() => store.deleteRows([3]), 'Inner');
    });
    expect(store.undoLabel()).toBe('Make 2 changes');
  });

  it('gives an unlabeled batch the label of what it did', () => {
    const store = createCrtStore(makeFour());
    store.batch(() => {
      store.setCell(0, 0, 'x');
      store.setCell(1, 0, 'y');
      store.setCell(0, 0, 'z');
    });
    expect(store.undoLabel()).toBe('Edit 2 cells');

    store.batch(() => store.insertRows(0, [['a', '', ''], ['b', '', '']]));
    expect(store.undoLabel()).toBe('Insert 2 rows');
    store.batch(() => store.deleteRows([0]));
    expect(store.undoLabel()).toBe('Delete row');
    store.batch(() => store.moveRows([1, 2], 1));
    expect(store.undoLabel()).toBe('Move 2 rows');
    store.batch(() => {
      store.deleteRows([0]);
      store.insertRows(0, [['q', '', '']]);
    });
    expect(store.undoLabel()).toBe('Make 2 changes');
  });

  it('with a label that is an empty string falls back to the derived label', () => {
    const store = createCrtStore(makeFour());
    store.batch(() => store.setCell(0, 0, 'x'), '');
    expect(store.undoLabel()).toBe('Edit cell');
  });

  it('makes a batch of many cell edits ONE step, even for the same cell written twice', () => {
    const store = createCrtStore(makeFour());
    store.batch(() => {
      for (let r = 0; r < 4; r++) store.setCell(r, 0, `n${r}`);
      store.setCell(0, 0, 'again');
      store.setCell(0, 0, 'A0');
    }, 'Replace all');
    expect(store.undoLabel()).toBe('Replace all');
    expect(editedCells(store)).toEqual(['1:0', '2:0', '3:0']);
    expect(store.undo()?.region).toEqual(region(0, 0, 3, 0));
    expect(allRows(store)).toEqual(FOUR_ROWS);
    expect(editedCells(store)).toEqual([]);
    store.redo();
    expect(firstColumn(store)).toEqual(['A0', 'n1', 'n2', 'n3']);
    expect(editedCells(store)).toEqual(['1:0', '2:0', '3:0']);
  });

  it('undoes a batch that mixes inserts, edits of the new rows, moves and deletes', () => {
    const store = createCrtStore(makeFour());
    const listener = listen(store);
    store.batch(() => {
      store.insertRows(0, [['N', 'n1', 'n2']]);
      store.setCell(0, 1, 'edited new');
      store.moveRows([0], 1);
      store.deleteRows([1, 3]);
      store.setCells(store.rowCount() - 1, 0, [['T1'], ['T2']], true);
    }, 'Mixed');
    const finalState = { rows: allRows(store), ids: rowIds(store), edited: editedCells(store) };
    expect(listener).toHaveBeenCalledTimes(1);

    store.undo();
    expect(allRows(store)).toEqual(FOUR_ROWS);
    expect(rowIds(store)).toEqual([0, 1, 2, 3]);
    expect(editedCells(store)).toEqual([]);
    expect(store.isDirty()).toBe(false);

    store.redo();
    expect({ rows: allRows(store), ids: rowIds(store), edited: editedCells(store) }).toEqual(finalState);
  });

  it('journals nothing and does not notify when nothing changed', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'edited');
    store.undo();
    const listener = listen(store);
    const version = store.version();

    expect(store.batch(() => 42)).toBe(42);
    store.batch(() => {
      store.setCell(0, 0, 'A0');
      store.deleteRows([]);
      store.insertRows(99, [['x', '', '']]);
      store.moveRows([0], -1);
    }, 'Nothing');
    expect(listener).not.toHaveBeenCalled();
    expect(store.version()).toBe(version);
    expect(store.canUndo()).toBe(false);
    // The redo stack of the earlier undo is untouched.
    expect(store.canRedo()).toBe(true);
  });

  it('journals nothing on a read only store', () => {
    const store = createCrtStore(makeTable());
    const listener = listen(store);
    store.batch(() => {
      store.setCell(0, 0, 'x');
      store.deleteRows([0]);
    }, 'Nope');
    expect(listener).not.toHaveBeenCalled();
    expect(store.canUndo()).toBe(false);
  });

  it('a change that is made and reverted inside a batch is still one step and one notification', () => {
    const store = createCrtStore(makeFour());
    const listener = listen(store);
    store.batch(() => {
      store.setCell(0, 0, 'x');
      store.setCell(0, 0, 'A0');
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.canUndo()).toBe(true);
    expect(store.isDirty()).toBe(false);
    store.undo();
    expect(store.getCell(0, 0)).toBe('A0');
  });

  it('keeps what was done as ONE step when the function throws, and rethrows the same error', () => {
    const store = createCrtStore(makeFour());
    const listener = listen(store);
    const boom = new Error('boom');
    let caught: unknown = null;
    try {
      store.batch(() => {
        store.setCell(0, 0, 'x');
        store.insertRows(0, [['n', '', '']]);
        throw boom;
      }, 'Partial');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(boom);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(1);
    expect(store.undoLabel()).toBe('Partial');
    expect(store.rowCount()).toBe(5);

    store.undo();
    expect(allRows(store)).toEqual(FOUR_ROWS);
    expect(store.canUndo()).toBe(false);
  });

  it('is usable after a throw: later changes are normal, separate steps', () => {
    const store = createCrtStore(makeFour());
    expect(() =>
      store.batch(() => {
        store.setCell(0, 0, 'x');
        throw new Error('boom');
      }),
    ).toThrow('boom');
    const listener = listen(store);
    store.setCell(1, 1, 'y');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.undoLabel()).toBe('Edit cell');
    store.undo();
    expect(store.getCell(1, 1)).toBe('b1');
    expect(store.getCell(0, 0)).toBe('x');
    store.undo();
    expect(store.getCell(0, 0)).toBe('A0');
  });

  it('journals nothing when the function throws before changing anything', () => {
    const store = createCrtStore(makeFour());
    const listener = listen(store);
    expect(() =>
      store.batch(() => {
        throw new Error('early');
      }),
    ).toThrow('early');
    expect(listener).not.toHaveBeenCalled();
    expect(store.canUndo()).toBe(false);
    expect(store.version()).toBe(0);
  });

  it('finishes the outer batch when a nested batch throws and the error is not caught', () => {
    const store = createCrtStore(makeFour());
    const listener = listen(store);
    expect(() =>
      store.batch(() => {
        store.setCell(0, 0, 'x');
        store.batch(() => {
          store.setCell(1, 0, 'y');
          throw new Error('inner');
        });
      }, 'Outer'),
    ).toThrow('inner');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.undoLabel()).toBe('Outer');
    store.undo();
    expect(allRows(store)).toEqual(FOUR_ROWS);
  });

  it('keeps one step when a nested batch throws and the outer function catches it', () => {
    const store = createCrtStore(makeFour());
    store.batch(() => {
      store.setCell(0, 0, 'x');
      try {
        store.batch(() => {
          store.setCell(1, 0, 'y');
          throw new Error('inner');
        });
      } catch {
        // The outer function carries on.
      }
      store.setCell(2, 0, 'z');
    }, 'Outer');
    expect(firstColumn(store)).toEqual(['x', 'y', 'z', 'D0']);
    store.undo();
    expect(allRows(store)).toEqual(FOUR_ROWS);
    expect(store.canUndo()).toBe(false);
  });

  it('makes undo and redo unavailable inside a batch', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'x');
    store.undo();
    store.setCell(1, 1, 'y');
    store.undo();
    const listener = listen(store);
    store.batch(() => {
      expect(store.undo()).toBeNull();
      expect(store.redo()).toBeNull();
      expect(store.canUndo()).toBe(false);
      expect(store.canRedo()).toBe(false);
      expect(store.undoLabel()).toBeNull();
      expect(store.redoLabel()).toBeNull();
    });
    expect(listener).not.toHaveBeenCalled();
    expect(store.canRedo()).toBe(true);
  });

  it('can run again straight after another batch', () => {
    const store = createCrtStore(makeFour());
    store.batch(() => store.setCell(0, 0, 'x'), 'First');
    store.batch(() => store.setCell(0, 0, 'y'), 'Second');
    expect(store.undoLabel()).toBe('Second');
    store.undo();
    expect(store.undoLabel()).toBe('First');
  });

  it('lets override() inside a batch drop what the batch did before it', () => {
    const store = createCrtStore(makeTable());
    const listener = listen(store);
    store.batch(() => {
      store.override();
      store.setCell(0, 0, 'x');
    }, 'Both');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(1);
    expect(store.isOverridden()).toBe(true);
    expect(store.undo()?.label).toBe('Both');
    expect(store.getCell(0, 0)).toBe('A');
    expect(store.canUndo()).toBe(false);
  });

  it('lets reset() inside a batch clear the whole history', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'x');
    store.batch(() => {
      store.setCell(1, 1, 'y');
      store.reset();
    });
    expect(store.canUndo()).toBe(false);
    expect(store.isOverridden()).toBe(false);
  });

  it('returns whatever the function returns, including undefined', () => {
    const store = createCrtStore(makeFour());
    expect(store.batch(() => undefined)).toBeUndefined();
    expect(store.batch(() => ({ a: 1 }))).toEqual({ a: 1 });
  });

  it('allows a listener to start a batch of its own', () => {
    const store = createCrtStore(makeFour());
    let fired = false;
    store.subscribe(() => {
      if (fired) return;
      fired = true;
      store.batch(() => store.setCell(3, 0, 'from listener'), 'Listener');
    });
    store.setCell(0, 0, 'x');
    expect(store.getCell(3, 0)).toBe('from listener');
    expect(store.undoLabel()).toBe('Listener');
    store.undo();
    expect(store.getCell(3, 0)).toBe('D0');
    expect(store.getCell(0, 0)).toBe('x');
  });
});

describe('journal: memory caps', () => {
  it('keeps at most CRT_MAX_HISTORY_ENTRIES steps and drops the oldest first', () => {
    expect(CRT_MAX_HISTORY_ENTRIES).toBe(500);
    const store = createCrtStore(makeFour());
    for (let i = 0; i < CRT_MAX_HISTORY_ENTRIES + 100; i++) store.setCell(0, 0, `v${i}`);
    expect(store.canUndo()).toBe(true);
    expect(undoAll(store)).toBe(CRT_MAX_HISTORY_ENTRIES);
    // The oldest 100 steps are gone: the first step that can be undone is edit number 100.
    expect(store.getCell(0, 0)).toBe('v99');
    expect(redoAll(store)).toBe(CRT_MAX_HISTORY_ENTRIES);
    expect(store.getCell(0, 0)).toBe(`v${CRT_MAX_HISTORY_ENTRIES + 99}`);
  });

  it('counts a group or a batch as one step', () => {
    const store = createCrtStore(makeFour());
    for (let i = 0; i < CRT_MAX_HISTORY_ENTRIES; i++) {
      store.batch(() => {
        store.setCell(0, 0, `a${i}`);
        store.setCell(1, 0, `b${i}`);
        store.insertRows(0, [['n', '', '']]);
        store.deleteRows([0]);
      });
    }
    expect(undoAll(store)).toBe(CRT_MAX_HISTORY_ENTRIES);
    expect(allRows(store)).toEqual(FOUR_ROWS);
  });

  it('keeps at most CRT_MAX_HISTORY_CELLS stored cells, counting a cells step by its length', () => {
    expect(CRT_MAX_HISTORY_CELLS).toBe(1000000);
    const store = createCrtStore(bigTable(10000, 20));
    // Six whole-table fills of 200,000 cells each pass one million, so the oldest one goes.
    for (let i = 0; i < 6; i++) store.fillCells(0, 0, 9999, 19, `f${i}`);
    expect(undoAll(store)).toBe(5);
    expect(store.getCell(0, 0)).toBe('f0');
    expect(store.getCell(9999, 19)).toBe('f0');
  });

  it('counts an insert or a delete as rows x columns', () => {
    const store = createCrtStore(makeTable({ columns: Array.from({ length: 20 }, (_, c) => `C${c}`), overrideRows: [] }));
    const rows = Array.from({ length: 10000 }, (_, r) => [`r${r}`]);
    // Each insert and each delete of 10,000 rows by 20 columns costs 200,000.
    for (let i = 0; i < 3; i++) {
      store.insertRows(0, rows);
      store.deleteRows(Array.from({ length: 10000 }, (_, r) => r));
    }
    expect(undoAll(store)).toBe(5);
    expect(store.rowCount()).toBe(10000);
  });

  it('counts the cells of a batch as one step and keeps the newest step even when it alone is over the cap', () => {
    const store = createCrtStore(bigTable(10000, 20));
    store.setCell(0, 0, 'before');
    store.batch(() => {
      for (let i = 0; i < 6; i++) store.fillCells(0, 0, 9999, 19, `f${i}`);
    }, 'Huge');
    // The earlier step was dropped to make room; the huge step is still undoable.
    expect(undoAll(store)).toBe(1);
    expect(store.getCell(0, 0)).toBe('before');
    expect(store.getCell(5, 5)).toBe('o5-5');
  });

  it('drops the redo stack with its cost, so the cap counts live steps only', () => {
    const store = createCrtStore(bigTable(10000, 20));
    for (let i = 0; i < 5; i++) store.fillCells(0, 0, 9999, 19, `f${i}`);
    store.undo();
    store.undo();
    // A new change clears the two redo steps. Their cost is given back, so the three kept steps and
    // the two new ones add up to exactly the cap and nothing is trimmed.
    for (let i = 0; i < 2; i++) store.fillCells(0, 0, 9999, 19, `g${i}`);
    expect(store.canRedo()).toBe(false);
    expect(undoAll(store)).toBe(5);
    expect(store.getCell(0, 0)).toBe('o0-0');
  });

  it('keeps entries on the redo stack when older undo steps are trimmed', () => {
    const store = createCrtStore(makeFour());
    for (let i = 0; i < CRT_MAX_HISTORY_ENTRIES + 10; i++) store.setCell(0, 0, `v${i}`);
    store.undo();
    store.undo();
    expect(store.canRedo()).toBe(true);
    store.redo();
    store.redo();
    expect(store.getCell(0, 0)).toBe(`v${CRT_MAX_HISTORY_ENTRIES + 9}`);
  });

  it('never changes isDirty when old history is dropped', () => {
    const store = createCrtStore(makeFour());
    // A move that is never reverted, then plenty of noise that pushes the move out of the history.
    store.moveRows([1], 1);
    store.setCell(0, 0, 'edited');
    expect(store.isDirty()).toBe(true);
    for (let i = 0; i < CRT_MAX_HISTORY_ENTRIES + 20; i++) {
      store.setCell(3, 1, `n${i}`);
      expect(store.isDirty()).toBe(true);
    }
    store.setCell(3, 1, 'd1');
    store.setCell(0, 0, 'A0');
    // Only the move (long gone from the history) keeps the table dirty.
    expect(store.changedCellCount()).toBe(0);
    expect(store.isDirty()).toBe(true);
    expect(undoAll(store)).toBe(CRT_MAX_HISTORY_ENTRIES);
    expect(store.isDirty()).toBe(true);
  });

  it('stays clean when the net change is nothing, even after the steps were dropped', () => {
    const store = createCrtStore(makeFour());
    store.moveRows([1], 1);
    store.moveRows([2], -1);
    for (let i = 0; i < CRT_MAX_HISTORY_ENTRIES + 20; i++) store.setCell(0, 0, i % 2 === 0 ? 'x' : 'A0');
    store.setCell(0, 0, 'A0');
    expect(store.isDirty()).toBe(false);
  });
});

describe('journal: dirtiness is exact and net', () => {
  it('is false after undoing every change of every kind', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'x');
    store.setCells(1, 0, [['p', 'q'], ['r', 's']]);
    store.fillCells(0, 2, 3, 2, 'f');
    store.insertRows(1, [['n1', '', ''], ['n2', '', '']]);
    store.moveRows([0, 4], 1);
    store.deleteRows([2, 3]);
    store.setCells(store.rowCount() - 1, 0, [['t'], ['u']], true);
    expect(store.isDirty()).toBe(true);
    undoAll(store);
    expect(store.isDirty()).toBe(false);
    expect(store.changedCellCount()).toBe(0);
    expect(allRows(store)).toEqual(FOUR_ROWS);
    redoAll(store);
    expect(store.isDirty()).toBe(true);
  });

  it('is false again after a row is moved down and back up', () => {
    const store = createCrtStore(makeFour());
    store.moveRows([1], 1);
    expect(store.isDirty()).toBe(true);
    store.moveRows([2], -1);
    expect(store.isDirty()).toBe(false);
  });

  it('is false again after an edit is edited back, and after an insert is deleted', () => {
    const store = createCrtStore(makeFour());
    store.setCell(1, 1, 'x');
    store.setCell(1, 1, 'b1');
    expect(store.isDirty()).toBe(false);
    store.insertRows(2, [['n', '', '']]);
    expect(store.isDirty()).toBe(true);
    store.deleteRows([2]);
    expect(store.isDirty()).toBe(false);
  });

  it('is true after a row is deleted and identical content is inserted (new id)', () => {
    const store = createCrtStore(makeFour());
    store.deleteRows([1]);
    store.insertRows(1, [['B0', 'b1', 'b2']]);
    expect(allRows(store)).toEqual(FOUR_ROWS);
    expect(store.isDirty()).toBe(true);
    undoAll(store);
    expect(store.isDirty()).toBe(false);
  });

  it('follows each undo and redo step by step', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'x');
    store.moveRows([1], 1);
    store.deleteRows([0]);
    const dirty: boolean[] = [store.isDirty()];
    while (store.undo() !== null) dirty.push(store.isDirty());
    expect(dirty).toEqual([true, true, true, false]);
    const forward: boolean[] = [];
    while (store.redo() !== null) forward.push(store.isDirty());
    expect(forward).toEqual([true, true, true]);
  });

  it('is true for a store that was overridden against a loaded default, whatever is undone', () => {
    const store = createCrtStore(makeTable());
    store.override();
    store.insertRows(0, [['n', '', '']]);
    store.undo();
    expect(store.isDirty()).toBe(true);
  });

  it('is cached per structure change: the ids are scanned once, not on every call', () => {
    const store = createCrtStore(bigTable(10000, 2));
    store.moveRows([5000], 1);
    expect(store.isDirty()).toBe(true);
    const start = performance.now();
    for (let i = 0; i < 5000; i++) store.isDirty();
    expect(performance.now() - start).toBeLessThan(50);
  });
});

describe('journal: regions', () => {
  it('covers the cells of an undone or redone edit, in the current row indexes', () => {
    const store = createCrtStore(makeFour());
    store.setCell(3, 2, 'x');
    store.insertRows(0, [['n', '', '']]);
    store.undo();
    // After undoing the insert the edited row is back at index 3.
    expect(store.undo()?.region).toEqual(region(3, 2, 3, 2));
    store.redo();
    store.redo();
    expect(store.undo()?.region).toEqual(region(0, 0, 0, 2));
  });

  it('points at the row now sitting where an undone insert was, clamped to the table', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(4, [['END', '', '']]);
    expect(store.undo()?.region).toEqual(region(3, 0, 3, 2));
    store.redo();
    expect(store.redo()).toBeNull();

    const middle = createCrtStore(makeFour());
    middle.insertRows(2, [['a', '', ''], ['b', '', ''], ['c', '', '']]);
    expect(middle.undo()?.region).toEqual(region(2, 0, 2, 2));
    expect(middle.redo()?.region).toEqual(region(2, 0, 4, 2));
  });

  it('covers every column of the restored rows of an undone delete', () => {
    const store = createCrtStore(makeFour());
    store.deleteRows([1, 2]);
    expect(store.undo()?.region).toEqual(region(1, 0, 2, 2));
    store.deleteRows([0, 2]);
    expect(store.undo()?.region).toEqual(region(0, 0, 2, 2));
  });

  it('points at the row now sitting where redone deletes were', () => {
    const contiguous = createCrtStore(makeFour());
    contiguous.deleteRows([1, 2]);
    contiguous.undo();
    expect(contiguous.redo()?.region).toEqual(region(1, 0, 1, 2));

    const last = createCrtStore(makeFour());
    last.deleteRows([3]);
    last.undo();
    // The deleted row was the last one: the new last row is the nearest.
    expect(last.redo()?.region).toEqual(region(2, 0, 2, 2));

    const first = createCrtStore(makeFour());
    first.deleteRows([0]);
    first.undo();
    expect(first.redo()?.region).toEqual(region(0, 0, 0, 2));

    const spread = createCrtStore(makeFour());
    spread.deleteRows([0, 2]);
    spread.undo();
    // Each removed row is followed by a surviving row: the bounding box of those rows.
    expect(spread.redo()?.region).toEqual(region(0, 0, 1, 2));
  });

  it('is null when the table is empty after the step', () => {
    const store = createCrtStore(makeFour());
    store.deleteRows([0, 1, 2, 3]);
    store.undo();
    expect(store.redo()?.region).toBeNull();
    const empty = createCrtStore(makeTable({ overrideRows: [] }));
    empty.insertRows(0, [['a', '', '']]);
    expect(empty.undo()?.region).toBeNull();
  });

  it('covers every column of the moved rows, as they are after the step', () => {
    const store = createCrtStore(makeFour());
    store.moveRows([2, 3], -1);
    expect(store.undo()?.region).toEqual(region(2, 0, 3, 2));
    expect(store.redo()?.region).toEqual(region(1, 0, 2, 2));
  });

  it('unions the parts of a batch in the final row indexes', () => {
    const store = createCrtStore(makeFour());
    store.batch(() => {
      store.setCell(3, 1, 'x');
      store.insertRows(0, [['n', '', '']]);
    });
    // Undo removes the new top row (the row now at 0) and edits the row that is back at index 3.
    expect(store.undo()?.region).toEqual(region(0, 0, 3, 2));
    expect(store.redo()?.region).toEqual(region(0, 0, 4, 2));
  });

  it('stays inside the table after a batch removed rows', () => {
    const store = createCrtStore(makeFour());
    store.batch(() => {
      store.setCell(0, 0, 'x');
      store.deleteRows([1, 2, 3]);
    });
    const undone = store.undo();
    expect(undone?.region).toEqual(region(0, 0, 3, 2));
    const redone = store.redo();
    expect(redone?.region?.r1).toBeLessThan(store.rowCount());
  });
});

// ---- randomized model test ----

/** A small, fast, seeded generator: the same seed always gives the same sequence. */
const seeded = (seed: number): (() => number) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const MODEL_COLS = 3;
const MODEL_SEQUENCES = 300;

interface Snapshot {
  rows: string[][];
  ids: number[];
}

const snapshotOf = (store: Store): Snapshot => ({ rows: allRows(store), ids: rowIds(store) });

/**
 * What the public reads must say about a snapshot, worked out from the definitions alone
 * (not from the store): a cell of an original row is edited when it differs from its first value.
 */
const expectedFingerprint = (snap: Snapshot, originals: Map<number, string[]>, initialCount: number): string => {
  const edited: string[] = [];
  const isNew: boolean[] = [];
  snap.rows.forEach((row, r) => {
    const id = snap.ids[r];
    isNew.push(id >= initialCount);
    row.forEach((value, c) => {
      if (id < initialCount && value !== (originals.get(id) as string[])[c]) edited.push(`${r}:${c}`);
    });
  });
  const identity = snap.ids.length === initialCount && snap.ids.every((id, i) => id === i);
  return JSON.stringify({ snap, edited, changed: edited.length, isNew, dirty: edited.length > 0 || !identity });
};

const actualFingerprint = (store: Store): string =>
  JSON.stringify({
    snap: snapshotOf(store),
    edited: editedCells(store),
    changed: store.changedCellCount(),
    isNew: newRows(store),
    dirty: store.isDirty(),
  });

interface ModelCounters {
  steps: number;
  labels: Set<string>;
  throws: number;
}

function runModelSequence(seed: number, interleave: boolean, counters: ModelCounters): void {
  const rnd = seeded(seed);
  const int = (n: number): number => Math.floor(rnd() * n);
  const pick = <T>(list: readonly T[]): T => list[int(list.length)];

  const initialCount = 3 + int(5);
  const initial = Array.from({ length: initialCount }, (_, r) => Array.from({ length: MODEL_COLS }, (_, c) => `r${r}c${c}`));
  const originals = new Map<number, string[]>(initial.map((row, id): [number, string[]] => [id, row.slice()]));
  const store = createCrtStore(makeTable({ columns: ['A', 'B', 'C'], overrideRows: initial.map((row) => row.slice()) }));
  let notifications = 0;
  store.subscribe(() => {
    notifications += 1;
  });

  const POOL = ['', 'x', 'y', 'z', 'A', 'B'];
  const value = (row: number, col: number): string => {
    // Often the original value of that cell, so edits are reverted and tracking has to follow.
    const original = originals.get(store.rowId(row))?.[col];
    return original !== undefined && rnd() < 0.3 ? original : pick(POOL);
  };
  const subset = (): number[] => {
    const out: number[] = [];
    for (let i = 0; i < store.rowCount(); i++) if (rnd() < 0.35) out.push(i);
    if (rnd() < 0.1) out.push(store.rowCount() + int(3));
    return out;
  };
  const setCell = (): void => {
    const r = int(store.rowCount() + 1);
    const c = int(MODEL_COLS);
    store.setCell(r, c, value(r, c));
  };
  const setCells = (): void => {
    const matrix = Array.from({ length: 1 + int(3) }, () => Array.from({ length: 1 + int(4) }, () => pick(POOL)));
    store.setCells(int(store.rowCount() + 1), int(MODEL_COLS), matrix, rnd() < 0.5);
  };
  const fill = (): void => {
    const r0 = int(store.rowCount() + 1);
    const c0 = int(MODEL_COLS);
    store.fillCells(r0, c0, r0 + int(3) - 1, c0 + int(3) - 1, value(r0, c0));
  };
  const insert = (): void => {
    const lines = Array.from({ length: 1 + int(3) }, () => Array.from({ length: 1 + int(3) }, () => pick(POOL)));
    store.insertRows(int(store.rowCount() + 1), lines);
  };
  const remove = (): void => {
    store.deleteRows(subset());
  };
  const move = (): void => {
    store.moveRows(subset(), rnd() < 0.5 ? -1 : 1);
  };
  const basic = [setCell, setCells, fill, insert, remove, move];
  const batch = (): void => {
    const label = rnd() < 0.5 ? 'Batch step' : undefined;
    const throws = rnd() < 0.15;
    try {
      store.batch(() => {
        const parts = 1 + int(4);
        for (let i = 0; i < parts; i++) {
          if (rnd() < 0.15) {
            store.batch(() => {
              pick(basic)();
              pick(basic)();
            });
          } else {
            pick(basic)();
          }
        }
        if (throws) throw new Error('boom');
      }, label);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'boom') throw error;
      counters.throws += 1;
    }
  };
  const mutations = [...basic, batch];

  const states: Snapshot[] = [snapshotOf(store)];
  let pointer = 0;
  const everSeen = new Set<number>(states[0].ids);
  let maxId = Math.max(-1, ...states[0].ids);

  const fail = (what: string): never => {
    throw new Error(`seed ${seed} step ${counters.steps}: ${what}`);
  };

  const checkConsistent = (): void => {
    const actual = actualFingerprint(store);
    const expected = expectedFingerprint(states[pointer], originals, initialCount);
    if (actual !== expected) expect(actual, `seed ${seed} step ${counters.steps}`).toBe(expected);
    if (store.canUndo() !== pointer > 0) fail('canUndo');
    if (store.canRedo() !== pointer < states.length - 1) fail('canRedo');
    if ((store.undoLabel() !== null) !== store.canUndo()) fail('undoLabel');
    if ((store.redoLabel() !== null) !== store.canRedo()) fail('redoLabel');
    const ids = rowIds(store);
    if (new Set(ids).size !== ids.length) fail('duplicate ids');
  };

  /** Every row whose text changed, or that appeared, must lie inside the region. */
  const checkRegion = (result: CrtHistoryResult, previous: Snapshot, next: Snapshot): void => {
    if (typeof result.label !== 'string' || result.label.length === 0) fail('empty label');
    counters.labels.add(result.label.replace(/[\d,]+/g, 'N'));
    const box = result.region;
    if (next.rows.length === 0) {
      if (box !== null) fail('region of an empty table');
      return;
    }
    if (box === null) return fail('missing region');
    if (box.r0 < 0 || box.r1 >= next.rows.length || box.r0 > box.r1) fail(`region rows ${JSON.stringify(box)}`);
    if (box.c0 < 0 || box.c1 >= MODEL_COLS || box.c0 > box.c1) fail(`region cols ${JSON.stringify(box)}`);
    const before = new Map<number, string[]>(previous.ids.map((id, r) => [id, previous.rows[r]]));
    next.rows.forEach((row, r) => {
      const old = before.get(next.ids[r]);
      if (old === undefined) {
        if (r < box.r0 || r > box.r1) fail(`appeared row ${r} outside ${JSON.stringify(box)}`);
        return;
      }
      row.forEach((text, c) => {
        if (text === old[c]) return;
        if (r < box.r0 || r > box.r1 || c < box.c0 || c > box.c1) {
          fail(`changed cell ${r}:${c} outside ${JSON.stringify(box)}`);
        }
      });
    });
  };

  const mutate = (): void => {
    const version = store.version();
    const heard = notifications;
    pick(mutations)();
    if (store.version() === version) {
      if (notifications !== heard) fail('notified without a version bump');
      return;
    }
    if (store.version() !== version + 1) fail('version moved by more than one');
    if (notifications !== heard + 1) fail('not exactly one notification');
    states.length = pointer + 1;
    states.push(snapshotOf(store));
    pointer += 1;
    for (const id of states[pointer].ids) {
      if (!everSeen.has(id) && id <= maxId) fail(`id ${id} was reused or rewound (max ${maxId})`);
    }
    for (const id of states[pointer].ids) {
      everSeen.add(id);
      if (id > maxId) maxId = id;
    }
  };

  const travel = (undoing: boolean): void => {
    const version = store.version();
    const heard = notifications;
    const available = undoing ? pointer > 0 : pointer < states.length - 1;
    const expectedLabel = undoing ? store.undoLabel() : store.redoLabel();
    const result = undoing ? store.undo() : store.redo();
    if (!available) {
      if (result !== null) fail('history step out of nowhere');
      if (store.version() !== version || notifications !== heard) fail('notified for nothing');
      return;
    }
    if (result === null) return fail('missing history step');
    const previous = states[pointer];
    pointer += undoing ? -1 : 1;
    if (result.label !== expectedLabel) fail('label differs from the one announced');
    if (store.version() !== version + 1) fail('undo or redo did not bump the version exactly once');
    if (notifications !== heard + 1) fail('undo or redo did not notify exactly once');
    checkRegion(result, previous, states[pointer]);
    for (const id of rowIds(store)) if (!everSeen.has(id)) fail('unknown id after undo or redo');
  };

  const steps = 5 + int(26);
  for (let i = 0; i < steps; i++) {
    counters.steps += 1;
    const roll = interleave ? rnd() : 0;
    if (roll < 0.55) mutate();
    else if (roll < 0.8) travel(true);
    else travel(false);
    checkConsistent();
  }

  const last = states.length - 1;
  if (!interleave && pointer !== last) fail('a plain sequence ends at the newest step');

  // Undo everything: the exact initial rows, ids and edit tracking come back.
  while (pointer > 0) travel(true);
  if (store.undo() !== null) fail('more to undo after undoing everything');
  checkConsistent();
  if (JSON.stringify(snapshotOf(store)) !== JSON.stringify({ rows: initial, ids: initial.map((_, i) => i) })) {
    fail('initial state not restored');
  }
  if (store.isDirty() || store.changedCellCount() !== 0 || editedCells(store).length !== 0) fail('not clean after undo all');

  // Redo everything: the final state comes back, whatever the interleaving was.
  while (pointer < last) travel(false);
  if (store.redo() !== null) fail('more to redo after redoing everything');
  checkConsistent();
  if (JSON.stringify(snapshotOf(store)) !== JSON.stringify(states[last])) fail('final state not restored');
}

describe('journal: randomized model test (seeded)', () => {
  it('undoes everything to the exact start and redoes everything to the exact end', () => {
    const counters: ModelCounters = { steps: 0, labels: new Set(), throws: 0 };
    for (let seed = 1; seed <= MODEL_SEQUENCES; seed++) runModelSequence(seed, false, counters);
    expect(counters.steps).toBeGreaterThanOrEqual(MODEL_SEQUENCES * 5);
    // Every kind of operation was exercised and undone at least once.
    const labels = Array.from(counters.labels).join('|');
    expect(labels).toMatch(/Edit/);
    expect(labels).toMatch(/Insert/);
    expect(labels).toMatch(/Delete/);
    expect(labels).toMatch(/Move/);
    expect(labels).toMatch(/Batch step/);
    expect(counters.throws).toBeGreaterThan(0);
  });

  it('survives random interleavings of changes, undo and redo, matching a reference model', () => {
    const counters: ModelCounters = { steps: 0, labels: new Set(), throws: 0 };
    for (let seed = 1001; seed < 1001 + MODEL_SEQUENCES; seed++) runModelSequence(seed, true, counters);
    expect(counters.steps).toBeGreaterThanOrEqual(MODEL_SEQUENCES * 5);
    expect(Array.from(counters.labels).join('|')).toMatch(/Edit/);
  });

  it('is deterministic: the same seed gives the same sequence', () => {
    const a = seeded(7);
    const b = seeded(7);
    const first = Array.from({ length: 5 }, () => a());
    expect(first).toEqual(Array.from({ length: 5 }, () => b()));
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(seeded(8)()).not.toBe(first[0]);
  });
});

// ---- timings ----

describe('journal: performance (10,000 rows by 20 columns)', () => {
  // These guard against an accidental quadratic slip, which would take seconds. A table wide fill
  // runs in about 30 ms alone, but the whole suite runs many files at once and one run measured
  // 150 ms, so the bound is loose enough that a busy machine does not fail it.
  const MAX_MS = 400;
  const time = (fn: () => void): number => {
    const start = performance.now();
    fn();
    return performance.now() - start;
  };

  /** The change, its undo and its redo must each finish well inside MAX_MS. */
  const timeAll = (store: Store, change: () => void): { change: number; undo: number; redo: number } => {
    const changed = time(change);
    const undone = time(() => {
      expect(store.undo()).not.toBeNull();
    });
    const redone = time(() => {
      expect(store.redo()).not.toBeNull();
    });
    return { change: changed, undo: undone, redo: redone };
  };

  const expectFast = (timings: { change: number; undo: number; redo: number }): void => {
    expect(timings.change).toBeLessThan(MAX_MS);
    expect(timings.undo).toBeLessThan(MAX_MS);
    expect(timings.redo).toBeLessThan(MAX_MS);
  };

  it('edits one cell, undoes and redoes it', () => {
    const store = createCrtStore(bigTable(10000, 20));
    expectFast(timeAll(store, () => store.setCell(9999, 19, 'edited')));
    expect(store.getCell(9999, 19)).toBe('edited');
  });

  it('writes a 1,000 row paste that grows the table, undoes and redoes it', () => {
    const store = createCrtStore(bigTable(9500, 20));
    const matrix = Array.from({ length: 1000 }, (_, r) => Array.from({ length: 20 }, (_, c) => `p${r}-${c}`));
    expectFast(timeAll(store, () => store.setCells(9000, 0, matrix, true)));
    expect(store.rowCount()).toBe(10000);
    expect(store.getCell(9999, 19)).toBe('p999-19');
    store.undo();
    expect(store.rowCount()).toBe(9500);
    // The row that was overwritten by the paste has its old text back.
    expect(store.getCell(9499, 19)).toBe('o9499-19');
  });

  it('fills 100,000 cells, undoes and redoes the fill', () => {
    const store = createCrtStore(bigTable(10000, 20));
    expectFast(timeAll(store, () => store.fillCells(0, 0, 4999, 19, 'z')));
    expect(store.getCell(4999, 19)).toBe('z');
  });

  it('fills the whole table, undoes and redoes the fill', () => {
    const store = createCrtStore(bigTable(10000, 20));
    expectFast(timeAll(store, () => store.fillCells(0, 0, 9999, 19, 'z')));
    expect(store.changedCellCount()).toBe(200000);
  });

  it('inserts 1,000 rows into the middle, undoes and redoes the insert', () => {
    const store = createCrtStore(bigTable(9000, 20));
    const rows = Array.from({ length: 1000 }, (_, r) => [`n${r}`]);
    expectFast(timeAll(store, () => store.insertRows(4500, rows)));
    expect(store.rowCount()).toBe(10000);
    expect(store.getCell(4500, 0)).toBe('n0');
  });

  it('deletes 5,000 rows that all carry an edit, undoes and redoes the delete', () => {
    const store = createCrtStore(bigTable(10000, 20));
    for (let r = 0; r < 10000; r++) store.setCell(r, 0, `e${r}`);
    const doomed = Array.from({ length: 5000 }, (_, r) => r * 2);
    expectFast(timeAll(store, () => store.deleteRows(doomed)));
    expect(store.rowCount()).toBe(5000);
    expect(store.changedCellCount()).toBe(5000);
    store.undo();
    expect(store.changedCellCount()).toBe(10000);
    expect(store.getCell(0, 0)).toBe('e0');
  });

  it('moves 9,999 rows, undoes and redoes the move', () => {
    const store = createCrtStore(bigTable(10000, 20));
    const selected = Array.from({ length: 9999 }, (_, r) => r + 1);
    expectFast(timeAll(store, () => store.moveRows(selected, -1)));
    expect(store.getCell(0, 0)).toBe('o1-0');
  });

  it('runs a batch of 10,000 single cell edits, undoes and redoes it', () => {
    const store = createCrtStore(bigTable(10000, 20));
    expectFast(
      timeAll(store, () =>
        store.batch(() => {
          for (let r = 0; r < 10000; r++) store.setCell(r, 19, `v${r}`);
        }, 'Replace all'),
      ),
    );
    expect(store.getCell(9999, 19)).toBe('v9999');
    expect(store.undoLabel()).toBe('Replace all');
  });

  it('undoes and redoes a long run of single edits one after the other without slowing down', () => {
    const store = createCrtStore(bigTable(10000, 20));
    for (let i = 0; i < CRT_MAX_HISTORY_ENTRIES; i++) store.setCell(i, 0, `x${i}`);
    const elapsed = time(() => {
      undoAll(store);
      redoAll(store);
    });
    expect(store.getCell(499, 0)).toBe('x499');
    // 1,000 steps, each a few microseconds: the whole walk has a generous bound.
    expect(elapsed).toBeLessThan(500);
  });
});
