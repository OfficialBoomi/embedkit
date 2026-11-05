/**
 * @file crtStoreSave.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Tests for what the store tells the save step: a deep copy of the rows (`rowsSnapshot`) and the
 * row level summary of what changed (`changeSummary`).
 */
import { describe, it, expect } from 'vitest';
import { createCrtStore } from '../../utils/crt/crtStore';
import type { CrtTableData } from '../../utils/crt/crtTypes';

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

/** Five own rows, so there is room to move, delete and insert. */
const makeOverridden = (): CrtTableData =>
  makeTable({
    overrideRows: [
      ['r0', 'Zero', 'EU'],
      ['r1', 'One', 'US'],
      ['r2', 'Two', 'EU'],
      ['r3', 'Three', 'US'],
      ['r4', 'Four', 'EU'],
    ],
  });

const NONE = { added: 0, edited: 0, removed: 0, reordered: false };

describe('rowsSnapshot', () => {
  it('copies the default rows of a table that is not overridden', () => {
    const table = makeTable();
    const store = createCrtStore(table);
    expect(store.rowsSnapshot()).toEqual(table.defaultRows);
  });

  it('copies the rows of an override, in order, after changes', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 1, 'Changed');
    store.insertRows(1, [['n', 'New', 'APAC']]);
    store.moveRows([3], 1);
    expect(store.rowsSnapshot()).toEqual([
      ['r0', 'Changed', 'EU'],
      ['n', 'New', 'APAC'],
      ['r1', 'One', 'US'],
      ['r3', 'Three', 'US'],
      ['r2', 'Two', 'EU'],
      ['r4', 'Four', 'EU'],
    ]);
  });

  it('is a deep copy: later edits do not reach it and editing it does not reach the store', () => {
    const store = createCrtStore(makeOverridden());
    const before = store.rowsSnapshot();
    store.setCell(0, 0, 'edited');
    store.deleteRows([4]);
    expect(before).toHaveLength(5);
    expect(before[0][0]).toBe('r0');

    const after = store.rowsSnapshot();
    after[0][0] = 'tampered';
    after.pop();
    expect(store.getCell(0, 0)).toBe('edited');
    expect(store.rowCount()).toBe(4);
    expect(store.rowsSnapshot()).toHaveLength(4);
  });

  it('copies the table the store was made from, not just points at it', () => {
    const table = makeOverridden();
    const store = createCrtStore(table);
    const snapshot = store.rowsSnapshot();
    expect(snapshot[0]).not.toBe(table.overrideRows![0]);
    snapshot[0][0] = 'tampered';
    expect(table.overrideRows![0][0]).toBe('r0');
  });

  it('is an empty list for an empty override, and for a table with no rows', () => {
    expect(createCrtStore(makeTable({ overrideRows: [] })).rowsSnapshot()).toEqual([]);
    expect(createCrtStore(makeTable({ defaultRows: [] })).rowsSnapshot()).toEqual([]);
  });

  it('has exactly one text cell per column, also for rows that were short or long', () => {
    const store = createCrtStore(makeTable({ overrideRows: [['only'], ['a', 'b', 'c', 'extra']] }));
    expect(store.rowsSnapshot()).toEqual([
      ['only', '', ''],
      ['a', 'b', 'c'],
    ]);
  });

  it('follows override() and reset()', () => {
    const table = makeTable();
    const store = createCrtStore(table);
    store.override();
    store.setCell(0, 0, 'mine');
    expect(store.rowsSnapshot()[0][0]).toBe('mine');
    store.reset();
    expect(store.rowsSnapshot()).toEqual(table.defaultRows);
  });

  it('does not change the version or notify', () => {
    const store = createCrtStore(makeOverridden());
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    const version = store.version();
    store.rowsSnapshot();
    store.changeSummary();
    expect(calls).toBe(0);
    expect(store.version()).toBe(version);
  });
});

describe('changeSummary: what was loaded and what shows', () => {
  it('a table loaded without an override', () => {
    const store = createCrtStore(makeTable());
    expect(store.changeSummary()).toEqual({ loadedOverridden: false, overridden: false, ...NONE });
  });

  it('a table loaded with an override', () => {
    const store = createCrtStore(makeOverridden());
    expect(store.changeSummary()).toEqual({ loadedOverridden: true, overridden: true, ...NONE });
  });

  it('an empty override still counts as loaded overridden', () => {
    const store = createCrtStore(makeTable({ overrideRows: [] }));
    expect(store.changeSummary()).toEqual({ loadedOverridden: true, overridden: true, ...NONE });
  });

  it('override() flips overridden and keeps what was loaded; the counts start from the copy', () => {
    const store = createCrtStore(makeTable());
    store.override();
    expect(store.changeSummary()).toEqual({ loadedOverridden: false, overridden: true, ...NONE });
    store.setCell(1, 1, 'mine');
    expect(store.changeSummary()).toEqual({ loadedOverridden: false, overridden: true, ...NONE, edited: 1 });
  });

  it('reset() of a loaded override flips overridden and keeps what was loaded', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 0, 'x');
    store.reset();
    expect(store.changeSummary()).toEqual({ loadedOverridden: true, overridden: false, ...NONE });
  });

  it('override() after reset() of a loaded override starts counting from the copy of the defaults', () => {
    const store = createCrtStore(makeOverridden());
    store.reset();
    store.override();
    store.deleteRows([0]);
    expect(store.changeSummary()).toEqual({ loadedOverridden: true, overridden: true, ...NONE, removed: 1 });
  });

  it('override() then reset() of a table loaded without an override is a clean table again', () => {
    const store = createCrtStore(makeTable());
    store.override();
    store.setCell(0, 0, 'mine');
    store.reset();
    expect(store.changeSummary()).toEqual({ loadedOverridden: false, overridden: false, ...NONE });
    expect(store.isDirty()).toBe(false);
  });
});

describe('changeSummary: edited rows', () => {
  it('counts a row once however many of its cells changed', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(2, 0, 'a');
    store.setCell(2, 1, 'b');
    store.setCell(2, 2, 'c');
    expect(store.changedCellCount()).toBe(3);
    expect(store.changeSummary()).toMatchObject({ ...NONE, edited: 1 });
  });

  it('counts each row that has an edit', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 0, 'a');
    store.setCell(3, 2, 'b');
    store.setCell(4, 1, 'c');
    expect(store.changeSummary()).toMatchObject({ ...NONE, edited: 3 });
  });

  it('a cell put back to its original value is no longer an edit', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(1, 1, 'changed');
    store.setCell(1, 1, 'One');
    expect(store.changeSummary()).toMatchObject(NONE);
    expect(store.isDirty()).toBe(false);
  });

  it('a row with one cell put back and another still changed stays edited', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(1, 0, 'x');
    store.setCell(1, 1, 'y');
    store.setCell(1, 0, 'r1');
    expect(store.changeSummary()).toMatchObject({ ...NONE, edited: 1 });
  });

  it('the edit follows its row when the row moves', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 1, 'edited');
    store.moveRows([0], 1);
    expect(store.changeSummary()).toMatchObject({ ...NONE, edited: 1, reordered: true });
  });

  it('a cell filled over a range counts the rows it touched', () => {
    const store = createCrtStore(makeOverridden());
    store.fillCells(1, 2, 3, 2, 'ZZ');
    expect(store.changeSummary()).toMatchObject({ ...NONE, edited: 3 });
  });
});

describe('changeSummary: added and removed rows', () => {
  it('counts inserted rows as added, and editing a new row is not an edit of an original row', () => {
    const store = createCrtStore(makeOverridden());
    store.insertRows(5, [['n1', '', ''], ['n2', '', '']]);
    store.setCell(5, 1, 'typed');
    expect(store.changeSummary()).toMatchObject({ ...NONE, added: 2 });
    expect(store.rowCount()).toBe(7);
  });

  it('rows appended by a paste past the end count as added', () => {
    const store = createCrtStore(makeOverridden());
    store.setCells(4, 0, [['p0', 'p1', 'p2'], ['q0', 'q1', 'q2'], ['s0', 's1', 's2']], true);
    expect(store.changeSummary()).toMatchObject({ added: 2, edited: 1, removed: 0 });
  });

  it('counts deleted original rows as removed', () => {
    const store = createCrtStore(makeOverridden());
    store.deleteRows([1, 3]);
    expect(store.changeSummary()).toMatchObject({ ...NONE, removed: 2 });
  });

  it('deleting the edited row removes it from the edited count; undo brings both back', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(2, 0, 'edited');
    store.deleteRows([2]);
    expect(store.changeSummary()).toMatchObject({ ...NONE, removed: 1 });
    store.undo();
    expect(store.changeSummary()).toMatchObject({ ...NONE, edited: 1 });
  });

  it('deleting a row that was just inserted leaves nothing behind', () => {
    const store = createCrtStore(makeOverridden());
    store.insertRows(2, [['n', '', '']]);
    store.deleteRows([2]);
    expect(store.changeSummary()).toMatchObject(NONE);
    expect(store.isDirty()).toBe(false);
  });

  it('adding one row and deleting another is one added and one removed', () => {
    const store = createCrtStore(makeOverridden());
    store.insertRows(5, [['n', '', '']]);
    store.deleteRows([0]);
    expect(store.changeSummary()).toMatchObject({ ...NONE, added: 1, removed: 1 });
    expect(store.rowCount()).toBe(5);
  });

  it('deleting every row leaves a table of zero rows with all of them removed', () => {
    const store = createCrtStore(makeOverridden());
    store.deleteRows([0, 1, 2, 3, 4]);
    expect(store.rowCount()).toBe(0);
    expect(store.changeSummary()).toMatchObject({ ...NONE, removed: 5 });
    expect(store.rowsSnapshot()).toEqual([]);
  });

  it('an empty override that gets rows has only added rows', () => {
    const store = createCrtStore(makeTable({ overrideRows: [] }));
    store.insertRows(0, [['a', 'b', 'c'], ['d', 'e', 'f']]);
    expect(store.changeSummary()).toMatchObject({ ...NONE, added: 2 });
  });
});

describe('changeSummary: order', () => {
  it('a row moved down is a change of order', () => {
    const store = createCrtStore(makeOverridden());
    store.moveRows([1], 1);
    expect(store.changeSummary()).toMatchObject({ ...NONE, reordered: true });
  });

  it('moving a row down and back up is no change at all', () => {
    const store = createCrtStore(makeOverridden());
    store.moveRows([1], 1);
    store.moveRows([2], -1);
    expect(store.changeSummary()).toMatchObject(NONE);
    expect(store.isDirty()).toBe(false);
  });

  it('deleting rows does not reorder the ones that remain', () => {
    const store = createCrtStore(makeOverridden());
    store.deleteRows([0, 2]);
    expect(store.changeSummary()).toMatchObject({ ...NONE, removed: 2 });
  });

  it('inserting rows does not reorder the original rows', () => {
    const store = createCrtStore(makeOverridden());
    store.insertRows(0, [['n', '', '']]);
    store.insertRows(3, [['m', '', '']]);
    expect(store.changeSummary()).toMatchObject({ ...NONE, added: 2 });
  });

  it('a moved row that is then deleted leaves the rest in order', () => {
    const store = createCrtStore(makeOverridden());
    store.moveRows([0], 1);
    store.deleteRows([1]);
    expect(store.changeSummary()).toMatchObject({ ...NONE, removed: 1 });
  });

  it('undo and redo of a move toggle the flag', () => {
    const store = createCrtStore(makeOverridden());
    store.moveRows([2, 3], -1);
    expect(store.changeSummary().reordered).toBe(true);
    store.undo();
    expect(store.changeSummary().reordered).toBe(false);
    store.redo();
    expect(store.changeSummary().reordered).toBe(true);
  });

  it('reordering together with other changes reports all of them', () => {
    const store = createCrtStore(makeOverridden());
    store.moveRows([4], -1);
    store.setCell(0, 0, 'edited');
    store.deleteRows([1]);
    store.insertRows(0, [['n', '', '']]);
    expect(store.changeSummary()).toMatchObject({ added: 1, edited: 1, removed: 1, reordered: true });
  });
});

/** A small repeatable random generator, so a failure can be replayed. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('changeSummary agrees with isDirty and with the rows', () => {
  it('after any run of edits, row operations, undo and redo', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const random = seeded(seed);
      const pick = (n: number): number => Math.floor(random() * n);
      const store = createCrtStore(makeOverridden());
      const originalCount = store.rowCount();
      for (let step = 0; step < 60; step++) {
        const count = store.rowCount();
        switch (pick(7)) {
          case 0:
            if (count > 0) store.setCell(pick(count), pick(3), `v${pick(4)}`);
            break;
          case 1:
            store.insertRows(pick(count + 1), [[`n${step}`, '', '']]);
            break;
          case 2:
            if (count > 0) store.deleteRows([pick(count)]);
            break;
          case 3:
            if (count > 1) store.moveRows([pick(count)], pick(2) === 0 ? -1 : 1);
            break;
          case 4:
            store.undo();
            break;
          case 5:
            store.redo();
            break;
          default:
            if (count > 0) store.fillCells(0, 0, pick(count), 0, 'F');
        }
        const s = store.changeSummary();
        const changed = s.added > 0 || s.edited > 0 || s.removed > 0 || s.reordered;
        expect(store.isDirty(), `seed ${seed} step ${step}`).toBe(changed);
        expect(store.rowCount(), `seed ${seed} step ${step}`).toBe(originalCount - s.removed + s.added);
        expect(store.rowsSnapshot()).toHaveLength(store.rowCount());
      }
    }
  });
});

describe('changeSummary on a large table', () => {
  it('counts a wide table with many rows', () => {
    const columns = Array.from({ length: 20 }, (_, c) => `C${c}`);
    const rows = Array.from({ length: 10000 }, (_, r) => columns.map((_, c) => `${r}-${c}`));
    const store = createCrtStore(makeTable({ columns, overrideRows: rows }));
    store.setCell(0, 0, 'x');
    store.setCell(0, 19, 'y');
    store.setCell(9999, 5, 'z');
    store.setCell(7000, 5, 'w');
    store.deleteRows([5000]);
    store.moveRows([10], 1);
    expect(store.changeSummary()).toMatchObject({ added: 0, edited: 3, removed: 1, reordered: true });
    expect(store.rowsSnapshot()).toHaveLength(9999);
  });
});
