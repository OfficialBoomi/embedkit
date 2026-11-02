/**
 * @file crtStore.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Tests for the cross reference table store: loading, normalization, editing,
 * override and reset, dirty tracking, versioning, subscriptions and row ids, and the
 * row operations (insert, delete, move, block write, fill, new rows).
 */
import { describe, it, expect, vi } from 'vitest';
import { CRT_MAX_ROWS, createCrtStore } from '../../utils/crt/crtStore';
import type { CrtTableData } from '../../utils/crt/crtTypes';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

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

const makeOverridden = (): CrtTableData =>
  makeTable({
    overrideRows: [
      ['X', 'Xray', 'EU'],
      ['Y', 'Yankee', 'US'],
    ],
  });

const bigTable = (rowCount: number, colCount: number, overridden: boolean): CrtTableData => {
  const columns = Array.from({ length: colCount }, (_, c) => `Col ${c}`);
  const build = (prefix: string): string[][] =>
    Array.from({ length: rowCount }, (_, r) => Array.from({ length: colCount }, (_, c) => `${prefix}${r}-${c}`));
  return makeTable({ columns, defaultRows: build('d'), overrideRows: overridden ? build('o') : null });
};

const allRows = (store: ReturnType<typeof createCrtStore>): string[][] =>
  Array.from({ length: store.rowCount() }, (_, r) =>
    Array.from({ length: store.colCount() }, (_, c) => store.getCell(r, c)),
  );

describe('createCrtStore: load without an override', () => {
  it('starts read only and shows the default rows', () => {
    const table = makeTable();
    const store = createCrtStore(table);
    expect(store.isOverridden()).toBe(false);
    expect(store.isEditable()).toBe(false);
    expect(store.colCount()).toBe(3);
    expect(store.rowCount()).toBe(3);
    expect(allRows(store)).toEqual(table.defaultRows);
    expect(store.getCell(1, 1)).toBe('Beta');
  });

  it('exposes the table and the column headers', () => {
    const table = makeTable();
    const store = createCrtStore(table);
    expect(store.table).toBe(table);
    expect(store.columns).toEqual(['Code', 'Name', 'Region']);
  });

  it('starts clean at version 0 with no edits', () => {
    const store = createCrtStore(makeTable());
    expect(store.isDirty()).toBe(false);
    expect(store.version()).toBe(0);
    expect(store.changedCellCount()).toBe(0);
  });

  it('refuses edits and leaves everything unchanged', () => {
    const table = makeTable();
    const before = clone(table);
    const store = createCrtStore(table);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.setCell(0, 0, 'changed')).toBe(false);
    expect(store.getCell(0, 0)).toBe('A');
    expect(store.version()).toBe(0);
    expect(store.isDirty()).toBe(false);
    expect(store.changedCellCount()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    expect(table).toEqual(before);
  });

  it('pads short default rows and cuts long ones for display, without touching the table', () => {
    const table = makeTable({ defaultRows: [['A'], ['B', 'Beta', 'US', 'extra', 'more'], ['C', 'Gamma', 'APAC']] });
    const before = clone(table);
    const store = createCrtStore(table);
    expect(allRows(store)).toEqual([
      ['A', '', ''],
      ['B', 'Beta', 'US'],
      ['C', 'Gamma', 'APAC'],
    ]);
    expect(table).toEqual(before);
  });

  it('handles a table with no rows', () => {
    const store = createCrtStore(makeTable({ defaultRows: [] }));
    expect(store.rowCount()).toBe(0);
    expect(store.getCell(0, 0)).toBe('');
    expect(store.rowId(0)).toBe(-1);
  });
});

describe('createCrtStore: load with an override', () => {
  it('starts overridden, editable and clean, showing the override rows', () => {
    const table = makeOverridden();
    const store = createCrtStore(table);
    expect(store.isOverridden()).toBe(true);
    expect(store.isEditable()).toBe(true);
    expect(store.isDirty()).toBe(false);
    expect(store.version()).toBe(0);
    expect(store.rowCount()).toBe(2);
    expect(allRows(store)).toEqual(table.overrideRows);
  });

  it('starts overridden for an override with zero rows', () => {
    const store = createCrtStore(makeTable({ overrideRows: [] }));
    expect(store.isOverridden()).toBe(true);
    expect(store.rowCount()).toBe(0);
    expect(store.setCell(0, 0, 'x')).toBe(false);
  });

  it('normalizes short and long override rows', () => {
    const table = makeTable({
      overrideRows: [['X'], ['Y', 'Yankee', 'US', 'extra'], [], ['Z', 'Zulu', 'EU']],
    });
    const before = clone(table);
    const store = createCrtStore(table);
    expect(allRows(store)).toEqual([
      ['X', '', ''],
      ['Y', 'Yankee', 'US'],
      ['', '', ''],
      ['Z', 'Zulu', 'EU'],
    ]);
    expect(table).toEqual(before);
  });

  it('does not share row arrays with table.overrideRows, including rows of the right length', () => {
    const table = makeOverridden();
    const store = createCrtStore(table);

    // A change in the table after loading does not reach the store.
    (table.overrideRows as string[][])[0][0] = 'outside';
    expect(store.getCell(0, 0)).toBe('X');

    // A change in the store does not reach the table.
    expect(store.setCell(1, 1, 'inside')).toBe(true);
    expect((table.overrideRows as string[][])[1][1]).toBe('Yankee');
  });
});

describe('createCrtStore: out of range reads', () => {
  it('returns an empty string for a cell outside the table', () => {
    const store = createCrtStore(makeOverridden());
    expect(store.getCell(-1, 0)).toBe('');
    expect(store.getCell(0, -1)).toBe('');
    expect(store.getCell(2, 0)).toBe('');
    expect(store.getCell(0, 3)).toBe('');
    expect(store.getCell(Number.NaN, 0)).toBe('');
    expect(store.getCell(0, 1.5)).toBe('');
  });

  it('returns -1 as the id of a row outside the table', () => {
    const store = createCrtStore(makeOverridden());
    expect(store.rowId(-1)).toBe(-1);
    expect(store.rowId(2)).toBe(-1);
    expect(store.rowId(Number.NaN)).toBe(-1);
    expect(store.rowId(0.5)).toBe(-1);
  });
});

describe('createCrtStore: setCell', () => {
  it('returns true and stores the value when it changed', () => {
    const store = createCrtStore(makeOverridden());
    expect(store.setCell(0, 1, 'Updated')).toBe(true);
    expect(store.getCell(0, 1)).toBe('Updated');
    expect(store.getCell(0, 0)).toBe('X');
    expect(store.getCell(1, 1)).toBe('Yankee');
  });

  it('returns false when the value is the same', () => {
    const store = createCrtStore(makeOverridden());
    expect(store.setCell(0, 1, 'Xray')).toBe(false);
    expect(store.version()).toBe(0);
    expect(store.isDirty()).toBe(false);
  });

  it('returns false when the row or the column is out of range', () => {
    const store = createCrtStore(makeOverridden());
    expect(store.setCell(-1, 0, 'v')).toBe(false);
    expect(store.setCell(2, 0, 'v')).toBe(false);
    expect(store.setCell(0, -1, 'v')).toBe(false);
    expect(store.setCell(0, 3, 'v')).toBe(false);
    expect(store.setCell(Number.NaN, 0, 'v')).toBe(false);
    expect(store.setCell(0, 0.5, 'v')).toBe(false);
    expect(store.version()).toBe(0);
    expect(store.changedCellCount()).toBe(0);
    expect(allRows(store)).toEqual(makeOverridden().overrideRows);
  });

  it('returns false when the table is read only', () => {
    const store = createCrtStore(makeTable());
    expect(store.setCell(0, 0, 'v')).toBe(false);
  });

  it('stores the value exactly as given, without trimming', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 0, '  padded  ');
    expect(store.getCell(0, 0)).toBe('  padded  ');
    store.setCell(0, 1, '\ttab\n');
    expect(store.getCell(0, 1)).toBe('\ttab\n');
  });

  it('can set a cell to an empty string', () => {
    const store = createCrtStore(makeOverridden());
    expect(store.setCell(0, 0, '')).toBe(true);
    expect(store.getCell(0, 0)).toBe('');
    expect(store.isCellEdited(0, 0)).toBe(true);
  });

  it('treats a value that differs only by whitespace as a change', () => {
    const store = createCrtStore(makeOverridden());
    expect(store.setCell(0, 0, 'X ')).toBe(true);
    expect(store.setCell(0, 0, 'X')).toBe(true);
    expect(store.isCellEdited(0, 0)).toBe(false);
  });

  it('never changes table.defaultRows or table.overrideRows when editing an override', () => {
    const table = makeOverridden();
    const before = clone(table);
    const store = createCrtStore(table);
    store.setCell(0, 0, 'one');
    store.setCell(1, 2, 'two');
    store.override();
    store.setCell(0, 0, 'three');
    store.reset();
    store.override();
    store.setCell(2, 2, 'four');
    expect(table.defaultRows).toEqual(before.defaultRows);
    expect(table.overrideRows).toEqual(before.overrideRows);
  });
});

describe('createCrtStore: override()', () => {
  it('copies the default rows and enables editing', () => {
    const table = makeTable();
    const store = createCrtStore(table);
    store.override();
    expect(store.isOverridden()).toBe(true);
    expect(store.isEditable()).toBe(true);
    expect(allRows(store)).toEqual(table.defaultRows);
    expect(store.setCell(0, 0, 'edited')).toBe(true);
    expect(store.getCell(0, 0)).toBe('edited');
  });

  it('never changes table.defaultRows when the copy is edited', () => {
    const table = makeTable();
    const before = clone(table.defaultRows);
    const store = createCrtStore(table);
    store.override();
    store.setCell(0, 0, 'edited');
    store.setCell(2, 2, 'edited too');
    expect(table.defaultRows).toEqual(before);
    expect(table.overrideRows).toBeNull();
  });

  it('copies default rows that are already the right length', () => {
    const table = makeTable();
    const store = createCrtStore(table);
    store.override();
    store.setCell(1, 0, 'edited');
    expect(table.defaultRows[1][0]).toBe('B');
  });

  it('normalizes the copy of short and long default rows', () => {
    const table = makeTable({ defaultRows: [['A'], ['B', 'Beta', 'US', 'extra']] });
    const store = createCrtStore(table);
    store.override();
    expect(allRows(store)).toEqual([
      ['A', '', ''],
      ['B', 'Beta', 'US'],
    ]);
    expect(table.defaultRows).toEqual([['A'], ['B', 'Beta', 'US', 'extra']]);
  });

  it('is a no-op when already overridden: keeps edits, version and listeners untouched', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 0, 'edited');
    const listener = vi.fn();
    store.subscribe(listener);
    const version = store.version();

    store.override();

    expect(store.getCell(0, 0)).toBe('edited');
    expect(store.rowCount()).toBe(2);
    expect(store.changedCellCount()).toBe(1);
    expect(store.version()).toBe(version);
    expect(listener).not.toHaveBeenCalled();
  });

  it('gives two overrides of the same table independent copies', () => {
    const table = makeTable();
    const store = createCrtStore(table);
    store.override();
    store.setCell(0, 0, 'first');
    store.reset();
    store.override();
    expect(store.getCell(0, 0)).toBe('A');
  });
});

describe('createCrtStore: reset()', () => {
  it('restores the default rows, goes read only and clears edits', () => {
    const table = makeOverridden();
    const store = createCrtStore(table);
    store.setCell(0, 0, 'edited');
    expect(store.changedCellCount()).toBe(1);

    store.reset();

    expect(store.isOverridden()).toBe(false);
    expect(store.isEditable()).toBe(false);
    expect(allRows(store)).toEqual(table.defaultRows);
    expect(store.rowCount()).toBe(3);
    expect(store.changedCellCount()).toBe(0);
    expect(store.isCellEdited(0, 0)).toBe(false);
    expect(store.setCell(0, 0, 'again')).toBe(false);
  });

  it('keeps table.overrideRows as it was', () => {
    const table = makeOverridden();
    const before = clone(table.overrideRows);
    const store = createCrtStore(table);
    store.setCell(0, 0, 'edited');
    store.reset();
    expect(table.overrideRows).toEqual(before);
  });

  it('clears the edits of an override created in the session', () => {
    const store = createCrtStore(makeTable());
    store.override();
    store.setCell(0, 0, 'edited');
    store.reset();
    expect(store.changedCellCount()).toBe(0);
    expect(allRows(store)).toEqual(makeTable().defaultRows);
  });

  it('is a no-op when not overridden', () => {
    const store = createCrtStore(makeTable());
    const listener = vi.fn();
    store.subscribe(listener);
    store.reset();
    expect(store.isOverridden()).toBe(false);
    expect(store.version()).toBe(0);
    expect(store.isDirty()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('after reset, override() starts again from the defaults, not the old override', () => {
    const store = createCrtStore(makeOverridden());
    store.reset();
    store.override();
    expect(allRows(store)).toEqual(makeTable().defaultRows);
  });
});

describe('createCrtStore: dirty', () => {
  it('is clean when not overridden at load, and override() makes it dirty', () => {
    const store = createCrtStore(makeTable());
    expect(store.isDirty()).toBe(false);
    store.override();
    expect(store.isDirty()).toBe(true);
  });

  it('is clean again after override() then reset() when not overridden at load', () => {
    const store = createCrtStore(makeTable());
    store.override();
    store.setCell(0, 0, 'edited');
    store.reset();
    expect(store.isDirty()).toBe(false);
  });

  it('is clean at load when overridden, and reset() makes it dirty', () => {
    const store = createCrtStore(makeOverridden());
    expect(store.isDirty()).toBe(false);
    store.reset();
    expect(store.isDirty()).toBe(true);
  });

  it('stays dirty after override() following reset() when overridden at load', () => {
    const store = createCrtStore(makeOverridden());
    store.reset();
    store.override();
    expect(store.isOverridden()).toBe(true);
    expect(store.changedCellCount()).toBe(0);
    expect(store.isDirty()).toBe(true);
  });

  it('becomes dirty on the first edit and clean when the edit is reverted', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 0, 'edited');
    expect(store.isDirty()).toBe(true);
    store.setCell(0, 0, 'X');
    expect(store.isDirty()).toBe(false);
  });

  it('stays dirty after reverting an edit when the rows were replaced by override()', () => {
    const store = createCrtStore(makeTable());
    store.override();
    store.setCell(0, 0, 'edited');
    store.setCell(0, 0, 'A');
    expect(store.changedCellCount()).toBe(0);
    expect(store.isDirty()).toBe(true);
  });
});

describe('createCrtStore: edit tracking', () => {
  it('marks only the edited cell', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(1, 2, 'edited');
    expect(store.isCellEdited(1, 2)).toBe(true);
    expect(store.isCellEdited(1, 1)).toBe(false);
    expect(store.isCellEdited(0, 2)).toBe(false);
  });

  it('clears the mark when the cell is set back to its original value', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(1, 2, 'edited');
    store.setCell(1, 2, 'US');
    expect(store.isCellEdited(1, 2)).toBe(false);
    expect(store.changedCellCount()).toBe(0);
  });

  it('remembers the first original value across several edits of the same cell', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 0, 'one');
    store.setCell(0, 0, 'two');
    expect(store.changedCellCount()).toBe(1);
    expect(store.isCellEdited(0, 0)).toBe(true);
    // Setting back to an intermediate value is still an edit.
    store.setCell(0, 0, 'one');
    expect(store.isCellEdited(0, 0)).toBe(true);
    // Setting back to the original value is not.
    store.setCell(0, 0, 'X');
    expect(store.isCellEdited(0, 0)).toBe(false);
    expect(store.changedCellCount()).toBe(0);
  });

  it('counts each changed cell once', () => {
    const store = createCrtStore(makeOverridden());
    expect(store.changedCellCount()).toBe(0);
    store.setCell(0, 0, 'a');
    expect(store.changedCellCount()).toBe(1);
    store.setCell(0, 0, 'b');
    expect(store.changedCellCount()).toBe(1);
    store.setCell(0, 1, 'c');
    store.setCell(1, 2, 'd');
    expect(store.changedCellCount()).toBe(3);
    store.setCell(0, 1, 'Xray');
    expect(store.changedCellCount()).toBe(2);
  });

  it('keeps cells of different rows and columns apart', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 1, 'a');
    store.setCell(1, 0, 'b');
    expect(store.isCellEdited(0, 1)).toBe(true);
    expect(store.isCellEdited(1, 0)).toBe(true);
    expect(store.isCellEdited(0, 0)).toBe(false);
    expect(store.isCellEdited(1, 1)).toBe(false);
  });

  it('reports false for addresses outside the table', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 0, 'a');
    expect(store.isCellEdited(-1, 0)).toBe(false);
    expect(store.isCellEdited(5, 0)).toBe(false);
    expect(store.isCellEdited(0, 7)).toBe(false);
  });

  it('is cleared by reset()', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 0, 'a');
    store.reset();
    expect(store.isCellEdited(0, 0)).toBe(false);
    expect(store.changedCellCount()).toBe(0);
  });

  it('is not carried into a new override', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 0, 'a');
    store.reset();
    store.override();
    expect(store.isCellEdited(0, 0)).toBe(false);
    expect(store.changedCellCount()).toBe(0);
  });
});

describe('createCrtStore: version', () => {
  it('starts at 0', () => {
    expect(createCrtStore(makeTable()).version()).toBe(0);
    expect(createCrtStore(makeOverridden()).version()).toBe(0);
  });

  it('increments on every setCell that changed something', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 0, 'a');
    expect(store.version()).toBe(1);
    store.setCell(0, 0, 'b');
    expect(store.version()).toBe(2);
    store.setCell(0, 0, 'X');
    expect(store.version()).toBe(3);
  });

  it('increments on override() and reset()', () => {
    const store = createCrtStore(makeTable());
    store.override();
    expect(store.version()).toBe(1);
    store.reset();
    expect(store.version()).toBe(2);
  });

  it('does not increment on calls that change nothing', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 0, 'X'); // same value
    store.setCell(9, 0, 'v'); // out of range
    store.setCell(0, 9, 'v'); // out of range
    store.override(); // already overridden
    expect(store.version()).toBe(0);

    store.reset();
    expect(store.version()).toBe(1);
    store.reset(); // not overridden
    store.setCell(0, 0, 'v'); // read only
    expect(store.version()).toBe(1);
  });
});

describe('createCrtStore: subscribe', () => {
  it('calls the listener once after each change', () => {
    const store = createCrtStore(makeTable());
    const listener = vi.fn();
    store.subscribe(listener);
    store.override();
    expect(listener).toHaveBeenCalledTimes(1);
    store.setCell(0, 0, 'a');
    expect(listener).toHaveBeenCalledTimes(2);
    store.reset();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('does not call the listener for calls that change nothing', () => {
    const store = createCrtStore(makeOverridden());
    const listener = vi.fn();
    store.subscribe(listener);
    store.setCell(0, 0, 'X');
    store.setCell(9, 9, 'v');
    store.override();
    expect(listener).not.toHaveBeenCalled();
  });

  it('calls the listener synchronously, after the state and the version have changed', () => {
    const store = createCrtStore(makeOverridden());
    const seen: Array<{ value: string; version: number; edited: boolean }> = [];
    store.subscribe(() => {
      seen.push({ value: store.getCell(0, 0), version: store.version(), edited: store.isCellEdited(0, 0) });
    });
    store.setCell(0, 0, 'a');
    expect(seen).toEqual([{ value: 'a', version: 1, edited: true }]);
  });

  it('stops calling a listener after it unsubscribes', () => {
    const store = createCrtStore(makeOverridden());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setCell(0, 0, 'a');
    unsubscribe();
    store.setCell(0, 0, 'b');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('allows unsubscribing twice', () => {
    const store = createCrtStore(makeOverridden());
    const other = vi.fn();
    const unsubscribe = store.subscribe(vi.fn());
    store.subscribe(other);
    unsubscribe();
    unsubscribe();
    store.setCell(0, 0, 'a');
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('keeps the other listeners when one unsubscribes', () => {
    const store = createCrtStore(makeOverridden());
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();
    store.subscribe(first);
    const unsubscribeSecond = store.subscribe(second);
    store.subscribe(third);
    unsubscribeSecond();
    store.setCell(0, 0, 'a');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(third).toHaveBeenCalledTimes(1);
  });

  it('calls every listener once per change, in the order they subscribed', () => {
    const store = createCrtStore(makeOverridden());
    const order: string[] = [];
    store.subscribe(() => order.push('first'));
    store.subscribe(() => order.push('second'));
    store.subscribe(() => order.push('third'));
    store.setCell(0, 0, 'a');
    expect(order).toEqual(['first', 'second', 'third']);
    store.setCell(0, 0, 'b');
    expect(order).toEqual(['first', 'second', 'third', 'first', 'second', 'third']);
  });

  it('calls a function subscribed twice twice, and one unsubscribe removes one subscription', () => {
    const store = createCrtStore(makeOverridden());
    const listener = vi.fn();
    const unsubscribeFirst = store.subscribe(listener);
    store.subscribe(listener);
    store.setCell(0, 0, 'a');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribeFirst();
    store.setCell(0, 0, 'b');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('does not call a listener that an earlier listener unsubscribed during the same change', () => {
    const store = createCrtStore(makeOverridden());
    const later = vi.fn();
    let unsubscribeLater = (): void => undefined;
    store.subscribe(() => unsubscribeLater());
    unsubscribeLater = store.subscribe(later);
    store.setCell(0, 0, 'a');
    expect(later).not.toHaveBeenCalled();
  });

  it('does not call a listener subscribed during a change until the next change', () => {
    const store = createCrtStore(makeOverridden());
    const added = vi.fn();
    let subscribed = false;
    store.subscribe(() => {
      if (!subscribed) {
        subscribed = true;
        store.subscribe(added);
      }
    });
    store.setCell(0, 0, 'a');
    expect(added).not.toHaveBeenCalled();
    store.setCell(0, 0, 'b');
    expect(added).toHaveBeenCalledTimes(1);
  });
});

describe('createCrtStore: row ids', () => {
  const ids = (store: ReturnType<typeof createCrtStore>): number[] =>
    Array.from({ length: store.rowCount() }, (_, r) => store.rowId(r));

  it('are sequential from 0 when not overridden', () => {
    expect(ids(createCrtStore(makeTable()))).toEqual([0, 1, 2]);
  });

  it('are sequential from 0 when overridden at load', () => {
    expect(ids(createCrtStore(makeOverridden()))).toEqual([0, 1]);
  });

  it('are not changed by edits', () => {
    const store = createCrtStore(makeOverridden());
    store.setCell(0, 0, 'a');
    store.setCell(1, 1, 'b');
    expect(ids(store)).toEqual([0, 1]);
  });

  it('are reassigned from 0 when override() replaces the rows', () => {
    const store = createCrtStore(makeTable({ defaultRows: [['A', '', ''], ['B', '', ''], ['C', '', ''], ['D', '', '']] }));
    expect(ids(store)).toEqual([0, 1, 2, 3]);
    store.override();
    expect(ids(store)).toEqual([0, 1, 2, 3]);
    expect(store.rowId(4)).toBe(-1);
  });

  it('are reassigned from 0 when reset() replaces the rows', () => {
    const table = makeTable({
      overrideRows: [['X', '', ''], ['Y', '', ''], ['Z', '', ''], ['W', '', ''], ['V', '', '']],
    });
    const store = createCrtStore(table);
    expect(ids(store)).toEqual([0, 1, 2, 3, 4]);
    store.reset();
    expect(ids(store)).toEqual([0, 1, 2]);
    expect(store.rowId(3)).toBe(-1);
    store.override();
    expect(ids(store)).toEqual([0, 1, 2]);
  });

  it('give the same id to the same row across two reads', () => {
    const store = createCrtStore(makeOverridden());
    expect(store.rowId(1)).toBe(store.rowId(1));
  });
});

describe('createCrtStore: independent stores', () => {
  it('two stores from the same table with no override do not affect each other', () => {
    const table = makeTable();
    const a = createCrtStore(table);
    const b = createCrtStore(table);
    const listenerB = vi.fn();
    b.subscribe(listenerB);

    a.override();
    a.setCell(0, 0, 'edited in a');

    expect(a.getCell(0, 0)).toBe('edited in a');
    expect(b.getCell(0, 0)).toBe('A');
    expect(b.isOverridden()).toBe(false);
    expect(b.isDirty()).toBe(false);
    expect(b.version()).toBe(0);
    expect(listenerB).not.toHaveBeenCalled();
    expect(table.defaultRows[0][0]).toBe('A');
  });

  it('two stores that both override the same table keep separate edits', () => {
    const table = makeTable();
    const a = createCrtStore(table);
    const b = createCrtStore(table);
    a.override();
    b.override();
    a.setCell(0, 0, 'from a');
    b.setCell(0, 0, 'from b');
    expect(a.getCell(0, 0)).toBe('from a');
    expect(b.getCell(0, 0)).toBe('from b');
    expect(a.changedCellCount()).toBe(1);
    expect(b.changedCellCount()).toBe(1);
  });

  it('two stores from the same table with an override do not share rows', () => {
    const table = makeOverridden();
    const a = createCrtStore(table);
    const b = createCrtStore(table);
    a.setCell(0, 0, 'from a');
    expect(b.getCell(0, 0)).toBe('X');
    expect(b.changedCellCount()).toBe(0);
    expect((table.overrideRows as string[][])[0][0]).toBe('X');
  });

  it('resetting one store does not change the other', () => {
    const table = makeOverridden();
    const a = createCrtStore(table);
    const b = createCrtStore(table);
    a.reset();
    expect(b.isOverridden()).toBe(true);
    expect(b.getCell(0, 0)).toBe('X');
  });
});

describe('createCrtStore: performance', () => {
  it('creates a store for 10,000 rows by 20 columns in under 200 ms without an override', () => {
    const table = bigTable(10000, 20, false);
    const start = performance.now();
    const store = createCrtStore(table);
    const elapsed = performance.now() - start;
    expect(store.rowCount()).toBe(10000);
    expect(store.colCount()).toBe(20);
    expect(store.getCell(9999, 19)).toBe('d9999-19');
    expect(elapsed).toBeLessThan(200);
  });

  it('creates a store for 10,000 rows by 20 columns in under 200 ms with an override', () => {
    const table = bigTable(10000, 20, true);
    const start = performance.now();
    const store = createCrtStore(table);
    const elapsed = performance.now() - start;
    expect(store.rowCount()).toBe(10000);
    expect(store.getCell(9999, 19)).toBe('o9999-19');
    expect(store.rowId(9999)).toBe(9999);
    expect(elapsed).toBeLessThan(200);
  });

  it('overrides a table of 10,000 rows by 20 columns in under 200 ms', () => {
    const table = bigTable(10000, 20, false);
    const store = createCrtStore(table);
    const start = performance.now();
    store.override();
    const elapsed = performance.now() - start;
    expect(store.getCell(9999, 19)).toBe('d9999-19');
    expect(elapsed).toBeLessThan(200);
    // The copy is independent of the defaults.
    store.setCell(9999, 19, 'edited');
    expect(table.defaultRows[9999][19]).toBe('d9999-19');
  });

  it('edits cells of a large table quickly', () => {
    const store = createCrtStore(bigTable(10000, 20, true));
    const start = performance.now();
    for (let r = 0; r < 10000; r++) store.setCell(r, 19, `v${r}`);
    const elapsed = performance.now() - start;
    expect(store.changedCellCount()).toBe(10000);
    expect(elapsed).toBeLessThan(200);
  });
});

type Store = ReturnType<typeof createCrtStore>;

const rowIds = (store: Store): number[] => Array.from({ length: store.rowCount() }, (_, r) => store.rowId(r));

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

const firstColumn = (store: Store): string[] => allRows(store).map((row) => row[0]);

/** Overridden table with `rowCount` rows and 3 columns, to reach CRT_MAX_ROWS cheaply. */
const sizedTable = (rowCount: number): CrtTableData =>
  makeTable({ overrideRows: Array.from({ length: rowCount }, (_, r) => [`r${r}`, '', '']) });

describe('createCrtStore: CRT_MAX_ROWS', () => {
  it('is 10,000', () => {
    expect(CRT_MAX_ROWS).toBe(10000);
  });
});

describe('createCrtStore: insertRows', () => {
  it('inserts before the given index and returns the index of the first inserted row', () => {
    const store = createCrtStore(makeFour());
    expect(store.insertRows(1, [['N1', 'x', 'y'], ['N2', 'x', 'y']])).toBe(1);
    expect(firstColumn(store)).toEqual(['A0', 'N1', 'N2', 'B0', 'C0', 'D0']);
  });

  it('inserts at 0 and appends at rowCount', () => {
    const store = createCrtStore(makeFour());
    expect(store.insertRows(0, [['TOP', '', '']])).toBe(0);
    expect(store.insertRows(store.rowCount(), [['END', '', '']])).toBe(5);
    expect(firstColumn(store)).toEqual(['TOP', 'A0', 'B0', 'C0', 'D0', 'END']);
  });

  it('inserts into a table with no rows', () => {
    const store = createCrtStore(makeTable({ overrideRows: [] }));
    expect(store.insertRows(0, [['only', '', '']])).toBe(0);
    expect(store.rowCount()).toBe(1);
  });

  it('pads short rows and cuts long rows to the column count', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(0, [['short'], ['a', 'b', 'c', 'd', 'e'], []]);
    expect(allRows(store).slice(0, 3)).toEqual([
      ['short', '', ''],
      ['a', 'b', 'c'],
      ['', '', ''],
    ]);
  });

  it('does not keep the arrays given by the caller', () => {
    const store = createCrtStore(makeFour());
    const given = [['N', 'x', 'y']];
    store.insertRows(0, given);
    given[0][0] = 'changed outside';
    given.push(['more', '', '']);
    expect(store.getCell(0, 0)).toBe('N');
    expect(store.rowCount()).toBe(5);
  });

  it('refuses and changes nothing when read only', () => {
    const table = makeTable();
    const store = createCrtStore(table);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.insertRows(0, [['N', '', '']])).toBe(-1);
    expect(allRows(store)).toEqual(table.defaultRows);
    expect(store.version()).toBe(0);
    expect(store.isDirty()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('refuses an empty list of rows', () => {
    const store = createCrtStore(makeFour());
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.insertRows(1, [])).toBe(-1);
    expect(store.version()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('refuses an index that is not an integer in 0..rowCount', () => {
    const store = createCrtStore(makeFour());
    const listener = vi.fn();
    store.subscribe(listener);
    for (const at of [-1, 5, 1.5, Number.NaN, Infinity]) {
      expect(store.insertRows(at, [['N', '', '']])).toBe(-1);
    }
    expect(store.rowCount()).toBe(4);
    expect(store.version()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('allows exactly CRT_MAX_ROWS rows and refuses one more, changing nothing', () => {
    const store = createCrtStore(sizedTable(CRT_MAX_ROWS - 2));
    expect(store.insertRows(0, [['a', '', ''], ['b', '', '']])).toBe(0);
    expect(store.rowCount()).toBe(CRT_MAX_ROWS);

    const version = store.version();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.insertRows(0, [['c', '', '']])).toBe(-1);
    expect(store.rowCount()).toBe(CRT_MAX_ROWS);
    expect(store.getCell(0, 0)).toBe('a');
    expect(store.version()).toBe(version);
    expect(listener).not.toHaveBeenCalled();
  });

  it('refuses a batch that would pass the limit as a whole, not row by row', () => {
    const store = createCrtStore(sizedTable(CRT_MAX_ROWS - 1));
    expect(store.insertRows(0, [['a', '', ''], ['b', '', '']])).toBe(-1);
    expect(store.rowCount()).toBe(CRT_MAX_ROWS - 1);
  });

  it('gives each new row a new unique id and keeps the ids of the other rows', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(2, [['N1', '', ''], ['N2', '', '']]);
    expect(rowIds(store)).toEqual([0, 1, 4, 5, 2, 3]);
  });

  it('never reuses an id, even after the row that had it was deleted', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(4, [['N1', '', '']]);
    expect(store.rowId(4)).toBe(4);
    store.deleteRows([4]);
    store.insertRows(4, [['N2', '', '']]);
    expect(store.rowId(4)).toBe(5);
    expect(new Set(rowIds(store)).size).toBe(store.rowCount());
  });

  it('notifies once and bumps the version by one for a batch', () => {
    const store = createCrtStore(makeFour());
    const listener = vi.fn();
    store.subscribe(listener);
    store.insertRows(0, [['a', '', ''], ['b', '', ''], ['c', '', '']]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(1);
  });

  it('makes the store dirty', () => {
    const store = createCrtStore(makeFour());
    expect(store.isDirty()).toBe(false);
    store.insertRows(0, [['a', '', '']]);
    expect(store.isDirty()).toBe(true);
    expect(store.changedCellCount()).toBe(0);
  });

  it('works on a store that was overridden in the session', () => {
    const store = createCrtStore(makeTable());
    store.override();
    expect(store.insertRows(3, [['D', '', '']])).toBe(3);
    expect(store.rowId(3)).toBe(3);
    expect(store.isRowNew(3)).toBe(true);
  });
});

describe('createCrtStore: deleteRows', () => {
  it('removes the given rows and returns how many were removed', () => {
    const store = createCrtStore(makeFour());
    expect(store.deleteRows([1, 2])).toBe(2);
    expect(firstColumn(store)).toEqual(['A0', 'D0']);
  });

  it('accepts any order, and ignores duplicates and out of range values', () => {
    const store = createCrtStore(makeFour());
    expect(store.deleteRows([3, 0, 3, 0, -1, 4, 99, 1.5, Number.NaN])).toBe(2);
    expect(firstColumn(store)).toEqual(['B0', 'C0']);
  });

  it('does not change the array given by the caller', () => {
    const store = createCrtStore(makeFour());
    const given = [3, 1, 3];
    store.deleteRows(given);
    expect(given).toEqual([3, 1, 3]);
  });

  it('keeps the ids of the remaining rows', () => {
    const store = createCrtStore(makeFour());
    store.deleteRows([1]);
    expect(rowIds(store)).toEqual([0, 2, 3]);
  });

  it('allows removing every row', () => {
    const store = createCrtStore(makeFour());
    expect(store.deleteRows([0, 1, 2, 3])).toBe(4);
    expect(store.rowCount()).toBe(0);
    expect(store.getCell(0, 0)).toBe('');
    expect(store.rowId(0)).toBe(-1);
    expect(store.isDirty()).toBe(true);
  });

  it('refuses and changes nothing when read only', () => {
    const table = makeTable();
    const store = createCrtStore(table);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.deleteRows([0, 1])).toBe(0);
    expect(allRows(store)).toEqual(table.defaultRows);
    expect(store.version()).toBe(0);
    expect(store.isDirty()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns 0 without a notification when nothing valid is given', () => {
    const store = createCrtStore(makeFour());
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.deleteRows([])).toBe(0);
    expect(store.deleteRows([-1, 4, 10])).toBe(0);
    expect(store.version()).toBe(0);
    expect(store.isDirty()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('drops the edit tracking of removed rows and keeps it for the others', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'edited');
    store.setCell(1, 1, 'edited');
    store.setCell(1, 2, 'edited');
    store.setCell(3, 0, 'edited');
    expect(store.changedCellCount()).toBe(4);

    store.deleteRows([1]);

    expect(store.changedCellCount()).toBe(2);
    expect(store.isCellEdited(0, 0)).toBe(true);
    expect(store.isCellEdited(2, 0)).toBe(true); // was row 3
    expect(store.isCellEdited(1, 1)).toBe(false);
  });

  it('keeps tracking working for rows after the removed ones', () => {
    const store = createCrtStore(makeFour());
    store.setCell(3, 0, 'edited');
    store.deleteRows([0, 1]);
    // Set back to the original value: the mark must clear, so the id still maps to the original.
    expect(store.setCell(1, 0, 'D0')).toBe(true);
    expect(store.isCellEdited(1, 0)).toBe(false);
    expect(store.changedCellCount()).toBe(0);
  });

  it('notifies once and bumps the version by one for a batch', () => {
    const store = createCrtStore(makeFour());
    const listener = vi.fn();
    store.subscribe(listener);
    store.deleteRows([0, 1, 2]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(1);
  });

  it('makes the store dirty', () => {
    const store = createCrtStore(makeFour());
    store.deleteRows([0]);
    expect(store.isDirty()).toBe(true);
    expect(store.changedCellCount()).toBe(0);
  });

  it('does not change table.overrideRows', () => {
    const table = makeFour();
    const before = clone(table);
    const store = createCrtStore(table);
    store.deleteRows([0, 1]);
    store.insertRows(0, [['x', '', '']]);
    store.moveRows([1], 1);
    expect(table).toEqual(before);
  });
});

describe('createCrtStore: moveRows', () => {
  const sixRows = (): Store =>
    createCrtStore(makeTable({ overrideRows: ['A', 'B', 'C', 'D', 'E', 'F'].map((v) => [v, '', '']) }));

  it('moves one row up and returns its new index', () => {
    const store = sixRows();
    expect(store.moveRows([2], -1)).toEqual([1]);
    expect(firstColumn(store)).toEqual(['A', 'C', 'B', 'D', 'E', 'F']);
  });

  it('moves one row down and returns its new index', () => {
    const store = sixRows();
    expect(store.moveRows([2], 1)).toEqual([3]);
    expect(firstColumn(store)).toEqual(['A', 'B', 'D', 'C', 'E', 'F']);
  });

  it('moves a contiguous block up as a unit', () => {
    const store = sixRows();
    expect(store.moveRows([2, 3, 4], -1)).toEqual([1, 2, 3]);
    expect(firstColumn(store)).toEqual(['A', 'C', 'D', 'E', 'B', 'F']);
  });

  it('moves a contiguous block down as a unit', () => {
    const store = sixRows();
    expect(store.moveRows([1, 2, 3], 1)).toEqual([2, 3, 4]);
    expect(firstColumn(store)).toEqual(['A', 'E', 'B', 'C', 'D', 'F']);
  });

  it('moves a split selection, each part one place', () => {
    const store = sixRows();
    expect(store.moveRows([1, 4], -1)).toEqual([0, 3]);
    expect(firstColumn(store)).toEqual(['B', 'A', 'C', 'E', 'D', 'F']);

    const down = sixRows();
    expect(down.moveRows([1, 4], 1)).toEqual([2, 5]);
    expect(firstColumn(down)).toEqual(['A', 'C', 'B', 'D', 'F', 'E']);
  });

  it('blocks the whole set when the first index is 0 and delta is -1', () => {
    const store = sixRows();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.moveRows([0, 3], -1)).toEqual([]);
    expect(firstColumn(store)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(store.version()).toBe(0);
    expect(store.isDirty()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('blocks the whole set when the last index is the last row and delta is +1', () => {
    const store = sixRows();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.moveRows([2, 5], 1)).toEqual([]);
    expect(firstColumn(store)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(store.version()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('still moves a set that touches the other edge', () => {
    const store = sixRows();
    expect(store.moveRows([0, 1], 1)).toEqual([1, 2]);
    expect(firstColumn(store)).toEqual(['C', 'A', 'B', 'D', 'E', 'F']);
  });

  it('normalizes the input: unsorted, duplicated and out of range indexes', () => {
    const store = sixRows();
    expect(store.moveRows([4, 2, 3, 2, 99, -1, 1.5, Number.NaN], -1)).toEqual([1, 2, 3]);
    expect(firstColumn(store)).toEqual(['A', 'C', 'D', 'E', 'B', 'F']);
  });

  it('does not change the array given by the caller', () => {
    const store = sixRows();
    const given = [4, 2, 2];
    store.moveRows(given, -1);
    expect(given).toEqual([4, 2, 2]);
  });

  it('returns [] for an empty or fully invalid selection, without a notification', () => {
    const store = sixRows();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.moveRows([], 1)).toEqual([]);
    expect(store.moveRows([-1, 6, 40], -1)).toEqual([]);
    expect(store.version()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('refuses and changes nothing when read only', () => {
    const table = makeTable();
    const store = createCrtStore(table);
    expect(store.moveRows([1], -1)).toEqual([]);
    expect(allRows(store)).toEqual(table.defaultRows);
    expect(store.version()).toBe(0);
    expect(store.isDirty()).toBe(false);
  });

  it('cannot move the only row of a one row table', () => {
    const store = createCrtStore(makeTable({ overrideRows: [['only', '', '']] }));
    expect(store.moveRows([0], -1)).toEqual([]);
    expect(store.moveRows([0], 1)).toEqual([]);
  });

  it('keeps row ids with their rows', () => {
    const store = sixRows();
    store.moveRows([3], -1);
    expect(rowIds(store)).toEqual([0, 1, 3, 2, 4, 5]);
    store.moveRows([0, 1], 1);
    expect(rowIds(store)).toEqual([3, 0, 1, 2, 4, 5]);
  });

  it('moves the edit tracking with the row', () => {
    const store = sixRows();
    store.setCell(3, 1, 'edited');
    store.moveRows([3], -1);
    expect(store.isCellEdited(2, 1)).toBe(true);
    expect(store.isCellEdited(3, 1)).toBe(false);
    expect(store.changedCellCount()).toBe(1);
    // Reverting the edit on the moved row clears its mark.
    store.setCell(2, 1, '');
    expect(store.isCellEdited(2, 1)).toBe(false);
    expect(store.changedCellCount()).toBe(0);
  });

  it('notifies once and bumps the version by one for a batch', () => {
    const store = sixRows();
    const listener = vi.fn();
    store.subscribe(listener);
    store.moveRows([2, 3, 4], 1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(1);
  });

  it('makes the store dirty', () => {
    const store = sixRows();
    store.moveRows([2], 1);
    expect(store.isDirty()).toBe(true);
    expect(store.changedCellCount()).toBe(0);
  });

  it('rejects a delta other than -1 or 1', () => {
    const store = sixRows();
    expect(store.moveRows([2], 2 as unknown as 1)).toEqual([]);
    expect(store.moveRows([2], 0 as unknown as 1)).toEqual([]);
    expect(firstColumn(store)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});

describe('createCrtStore: setCells', () => {
  it('writes a matrix with its top left corner at the start cell', () => {
    const store = createCrtStore(makeFour());
    const result = store.setCells(1, 1, [['p', 'q'], ['r', 's']]);
    expect(result).toEqual({ changed: 4, added: 0, cutColumns: false, overflow: false });
    expect(allRows(store)).toEqual([
      ['A0', 'a1', 'a2'],
      ['B0', 'p', 'q'],
      ['C0', 'r', 's'],
      ['D0', 'd1', 'd2'],
    ]);
  });

  it('returns null when read only', () => {
    const table = makeTable();
    const store = createCrtStore(table);
    expect(store.setCells(0, 0, [['x']])).toBeNull();
    expect(allRows(store)).toEqual(table.defaultRows);
    expect(store.version()).toBe(0);
  });

  it('returns null when the start is not an integer cell inside the grid', () => {
    const store = createCrtStore(makeFour());
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.setCells(-1, 0, [['x']])).toBeNull();
    expect(store.setCells(0, -1, [['x']])).toBeNull();
    expect(store.setCells(4, 0, [['x']], true)).toBeNull();
    expect(store.setCells(0, 3, [['x']])).toBeNull();
    expect(store.setCells(0.5, 0, [['x']])).toBeNull();
    expect(store.setCells(0, Number.NaN, [['x']])).toBeNull();
    expect(store.rowCount()).toBe(4);
    expect(store.version()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns null for an empty table, since no start cell is inside the grid', () => {
    const store = createCrtStore(makeTable({ overrideRows: [] }));
    expect(store.setCells(0, 0, [['x']], true)).toBeNull();
    expect(store.rowCount()).toBe(0);
  });

  it('returns a zero result for an empty matrix, without a notification', () => {
    const store = createCrtStore(makeFour());
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.setCells(0, 0, [])).toEqual({ changed: 0, added: 0, cutColumns: false, overflow: false });
    expect(store.setCells(0, 0, [], true)).toEqual({ changed: 0, added: 0, cutColumns: false, overflow: false });
    expect(store.version()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('counts only cells whose value changed and does not notify when none did', () => {
    const store = createCrtStore(makeFour());
    const listener = vi.fn();
    store.subscribe(listener);
    const same = store.setCells(0, 0, [['A0', 'a1'], ['B0', 'b1']]);
    expect(same).toEqual({ changed: 0, added: 0, cutColumns: false, overflow: false });
    expect(listener).not.toHaveBeenCalled();
    expect(store.version()).toBe(0);

    const partly = store.setCells(0, 0, [['A0', 'new'], ['B0', 'b1']]);
    expect(partly?.changed).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('drops columns past the last column and reports cutColumns', () => {
    const store = createCrtStore(makeFour());
    const result = store.setCells(0, 1, [['p', 'q', 'extra', 'more']]);
    expect(result).toEqual({ changed: 2, added: 0, cutColumns: true, overflow: false });
    expect(allRows(store)[0]).toEqual(['A0', 'p', 'q']);
    expect(store.colCount()).toBe(3);
  });

  it('does not report cutColumns when the matrix ends exactly at the last column', () => {
    const store = createCrtStore(makeFour());
    expect(store.setCells(0, 1, [['p', 'q']])?.cutColumns).toBe(false);
  });

  it('ignores empty cells past the last column (trailing tabs carry nothing)', () => {
    const store = createCrtStore(makeFour());
    expect(store.setCells(0, 1, [['p', 'q', '', '']])?.cutColumns).toBe(false);
    expect(store.setCells(0, 1, [['p', 'q', '', 'x']])?.cutColumns).toBe(true);
  });

  it('handles a ragged matrix, cutting only the wide lines', () => {
    const store = createCrtStore(makeFour());
    const result = store.setCells(0, 1, [['p'], ['q', 'r', 's']]);
    expect(result).toEqual({ changed: 3, added: 0, cutColumns: true, overflow: false });
    expect(allRows(store).slice(0, 2)).toEqual([
      ['A0', 'p', 'a2'],
      ['B0', 'q', 'r'],
    ]);
  });

  it('drops rows past the last row when grow is false or not given', () => {
    const store = createCrtStore(makeFour());
    const result = store.setCells(3, 0, [['x0', 'x1'], ['y0', 'y1'], ['z0', 'z1']]);
    expect(result).toEqual({ changed: 2, added: 0, cutColumns: false, overflow: false });
    expect(store.rowCount()).toBe(4);

    const explicit = createCrtStore(makeFour());
    expect(explicit.setCells(3, 0, [['x0'], ['y0']], false)).toEqual({
      changed: 1,
      added: 0,
      cutColumns: false,
      overflow: false,
    });
    expect(explicit.rowCount()).toBe(4);
    expect(explicit.changedCellCount()).toBe(1);
  });

  it('appends rows past the last row when grow is true', () => {
    const store = createCrtStore(makeFour());
    const result = store.setCells(3, 1, [['x1', 'x2'], ['y1', 'y2'], ['z1', 'z2']], true);
    expect(result).toEqual({ changed: 6, added: 2, cutColumns: false, overflow: false });
    expect(allRows(store).slice(3)).toEqual([
      ['D0', 'x1', 'x2'],
      ['', 'y1', 'y2'],
      ['', 'z1', 'z2'],
    ]);
    expect(store.rowCount()).toBe(6);
  });

  it('appends blank-normalized rows: columns before the start and after the matrix stay empty', () => {
    const store = createCrtStore(makeFour());
    store.setCells(3, 1, [['x'], ['y']], true);
    expect(allRows(store)[4]).toEqual(['', 'y', '']);
  });

  it('counts a blank cell written into an appended row as not changed, but the row as added', () => {
    const store = createCrtStore(makeFour());
    const listener = vi.fn();
    store.subscribe(listener);
    const result = store.setCells(3, 0, [['D0'], ['']], true);
    expect(result).toEqual({ changed: 0, added: 1, cutColumns: false, overflow: false });
    expect(store.rowCount()).toBe(5);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.isDirty()).toBe(true);
  });

  it('does not append rows when grow is true but the matrix fits', () => {
    const store = createCrtStore(makeFour());
    const result = store.setCells(2, 0, [['x'], ['y']], true);
    expect(result?.added).toBe(0);
    expect(store.rowCount()).toBe(4);
  });

  it('reports cutColumns for appended rows too', () => {
    const store = createCrtStore(makeFour());
    const result = store.setCells(3, 2, [['a', 'b'], ['c', 'd']], true);
    expect(result).toEqual({ changed: 2, added: 1, cutColumns: true, overflow: false });
    expect(allRows(store)[4]).toEqual(['', '', 'c']);
  });

  it('reports cutColumns only for rows that are written when growing is off', () => {
    const store = createCrtStore(makeFour());
    // The wide line falls past the last row and is dropped as a row, not cut as columns.
    expect(store.setCells(3, 2, [['a'], ['b', 'c']])?.cutColumns).toBe(false);
  });

  it('gives appended rows new ids and marks them new', () => {
    const store = createCrtStore(makeFour());
    store.setCells(3, 0, [['x'], ['y'], ['z']], true);
    expect(rowIds(store)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(store.isRowNew(3)).toBe(false);
    expect(store.isRowNew(4)).toBe(true);
    expect(store.isRowNew(5)).toBe(true);
  });

  it('allows growing up to exactly CRT_MAX_ROWS', () => {
    const store = createCrtStore(sizedTable(CRT_MAX_ROWS - 2));
    const matrix = [['a'], ['b'], ['c']];
    const result = store.setCells(CRT_MAX_ROWS - 3, 0, matrix, true);
    expect(result).toEqual({ changed: 3, added: 2, cutColumns: false, overflow: false });
    expect(store.rowCount()).toBe(CRT_MAX_ROWS);
  });

  it('refuses to pass CRT_MAX_ROWS and changes nothing', () => {
    const store = createCrtStore(sizedTable(CRT_MAX_ROWS - 1));
    const before = allRows(store);
    const listener = vi.fn();
    store.subscribe(listener);
    const result = store.setCells(CRT_MAX_ROWS - 2, 0, [['a', 'b', 'c', 'd'], ['e'], ['f']], true);
    expect(result).toEqual({ changed: 0, added: 0, cutColumns: true, overflow: true });
    expect(allRows(store)).toEqual(before);
    expect(store.rowCount()).toBe(CRT_MAX_ROWS - 1);
    expect(store.version()).toBe(0);
    expect(store.isDirty()).toBe(false);
    expect(store.changedCellCount()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not report overflow when growing is off, even for a matrix that would pass the limit', () => {
    const store = createCrtStore(sizedTable(CRT_MAX_ROWS));
    const result = store.setCells(CRT_MAX_ROWS - 1, 0, [['a'], ['b']]);
    expect(result).toEqual({ changed: 1, added: 0, cutColumns: false, overflow: false });
    expect(store.rowCount()).toBe(CRT_MAX_ROWS);
  });

  it('tracks edits of existing rows like setCell, including reverting to the original', () => {
    const store = createCrtStore(makeFour());
    store.setCells(0, 0, [['one', 'two']]);
    expect(store.changedCellCount()).toBe(2);
    expect(store.isCellEdited(0, 0)).toBe(true);
    store.setCells(0, 0, [['A0', 'a1']]);
    expect(store.changedCellCount()).toBe(0);
    expect(store.isCellEdited(0, 0)).toBe(false);
    expect(store.isDirty()).toBe(false);
  });

  it('does not track edits of new rows', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(0, [['n', 'n', 'n']]);
    store.setCells(0, 0, [['x', 'y']]);
    expect(store.getCell(0, 0)).toBe('x');
    expect(store.isCellEdited(0, 0)).toBe(false);
    expect(store.changedCellCount()).toBe(0);
  });

  it('notifies once and bumps the version by one for the whole call', () => {
    const store = createCrtStore(makeFour());
    const listener = vi.fn();
    store.subscribe(listener);
    store.setCells(0, 0, [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i'], ['j', 'k', 'l'], ['m', 'n', 'o']], true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(1);
  });

  it('does not keep the matrix given by the caller', () => {
    const store = createCrtStore(makeFour());
    const matrix = [['x', 'y'], ['z', 'w']];
    store.setCells(3, 0, matrix, true);
    matrix[1][0] = 'changed outside';
    expect(store.getCell(4, 0)).toBe('z');
  });

  it('becomes dirty through the edits, or through added rows', () => {
    const store = createCrtStore(makeFour());
    store.setCells(0, 0, [['same']]);
    expect(store.isDirty()).toBe(true);
    store.setCells(0, 0, [['A0']]);
    expect(store.isDirty()).toBe(false);
    store.setCells(3, 0, [['D0'], ['']], true);
    expect(store.isDirty()).toBe(true);
  });

  it('does not change table.overrideRows', () => {
    const table = makeFour();
    const before = clone(table);
    const store = createCrtStore(table);
    store.setCells(0, 0, [['x', 'y'], ['z', 'w']]);
    store.setCells(3, 0, [['a'], ['b']], true);
    expect(table).toEqual(before);
  });
});

describe('createCrtStore: fillCells', () => {
  it('sets every cell of the range and returns how many changed', () => {
    const store = createCrtStore(makeFour());
    expect(store.fillCells(1, 1, 2, 2, 'z')).toBe(4);
    expect(allRows(store)).toEqual([
      ['A0', 'a1', 'a2'],
      ['B0', 'z', 'z'],
      ['C0', 'z', 'z'],
      ['D0', 'd1', 'd2'],
    ]);
  });

  it('accepts the corners in any order', () => {
    const store = createCrtStore(makeFour());
    expect(store.fillCells(2, 2, 1, 1, 'z')).toBe(4);
    expect(store.getCell(1, 1)).toBe('z');
    expect(store.getCell(2, 2)).toBe('z');
    const other = createCrtStore(makeFour());
    expect(other.fillCells(1, 2, 2, 1, 'z')).toBe(4);
  });

  it('fills a single cell', () => {
    const store = createCrtStore(makeFour());
    expect(store.fillCells(0, 0, 0, 0, 'z')).toBe(1);
    expect(store.getCell(0, 0)).toBe('z');
  });

  it('clamps a range that reaches outside the grid', () => {
    const store = createCrtStore(makeFour());
    expect(store.fillCells(-5, -5, 1, 1, 'z')).toBe(4);
    expect(store.getCell(0, 0)).toBe('z');
    expect(store.getCell(1, 1)).toBe('z');
    expect(store.getCell(2, 2)).toBe('c2');

    const bottom = createCrtStore(makeFour());
    expect(bottom.fillCells(2, 1, 100, 100, 'y')).toBe(4);
    expect(bottom.rowCount()).toBe(4);
    expect(bottom.colCount()).toBe(3);
    expect(bottom.getCell(3, 2)).toBe('y');
  });

  it('returns 0 for a range completely outside the grid', () => {
    const store = createCrtStore(makeFour());
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.fillCells(10, 0, 20, 2, 'z')).toBe(0);
    expect(store.fillCells(-5, 0, -1, 2, 'z')).toBe(0);
    expect(store.fillCells(0, 7, 3, 9, 'z')).toBe(0);
    expect(store.version()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns 0 for coordinates that are not integers', () => {
    const store = createCrtStore(makeFour());
    expect(store.fillCells(0.5, 0, 1, 1, 'z')).toBe(0);
    expect(store.fillCells(0, Number.NaN, 1, 1, 'z')).toBe(0);
    expect(store.version()).toBe(0);
  });

  it('counts only the cells that changed', () => {
    const store = createCrtStore(makeFour());
    expect(store.fillCells(0, 0, 1, 0, 'A0')).toBe(1);
    expect(store.fillCells(0, 0, 1, 0, 'A0')).toBe(0);
  });

  it('notifies once, and not at all when nothing changed', () => {
    const store = createCrtStore(makeFour());
    const listener = vi.fn();
    store.subscribe(listener);
    store.fillCells(0, 0, 3, 2, 'z');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(1);
    store.fillCells(0, 0, 3, 2, 'z');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.version()).toBe(1);
  });

  it('refuses and changes nothing when read only', () => {
    const table = makeTable();
    const store = createCrtStore(table);
    expect(store.fillCells(0, 0, 2, 2, 'z')).toBe(0);
    expect(allRows(store)).toEqual(table.defaultRows);
    expect(store.version()).toBe(0);
  });

  it('does nothing on a table with no rows', () => {
    const store = createCrtStore(makeTable({ overrideRows: [] }));
    expect(store.fillCells(0, 0, 5, 5, 'z')).toBe(0);
    expect(store.version()).toBe(0);
  });

  it('tracks edits of original rows and not of new rows', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(4, [['n', 'n', 'n']]);
    expect(store.fillCells(3, 0, 4, 0, 'z')).toBe(2);
    expect(store.isCellEdited(3, 0)).toBe(true);
    expect(store.isCellEdited(4, 0)).toBe(false);
    expect(store.changedCellCount()).toBe(1);
    store.fillCells(3, 0, 3, 0, 'D0');
    expect(store.isCellEdited(3, 0)).toBe(false);
  });

  it('can fill with an empty string', () => {
    const store = createCrtStore(makeFour());
    expect(store.fillCells(0, 0, 0, 2, '')).toBe(3);
    expect(allRows(store)[0]).toEqual(['', '', '']);
  });
});

describe('createCrtStore: isRowNew', () => {
  it('is false for every original row and for out of range rows', () => {
    const store = createCrtStore(makeFour());
    for (let r = 0; r < 4; r++) expect(store.isRowNew(r)).toBe(false);
    expect(store.isRowNew(-1)).toBe(false);
    expect(store.isRowNew(4)).toBe(false);
    expect(store.isRowNew(0.5)).toBe(false);
    expect(store.isRowNew(Number.NaN)).toBe(false);
  });

  it('is true for inserted rows only, and follows them when rows move or are deleted', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(1, [['N1', '', ''], ['N2', '', '']]);
    expect(Array.from({ length: 6 }, (_, r) => store.isRowNew(r))).toEqual([false, true, true, false, false, false]);

    store.moveRows([1], 1);
    expect(Array.from({ length: 6 }, (_, r) => store.isRowNew(r))).toEqual([false, true, true, false, false, false]);
    expect(store.getCell(1, 0)).toBe('N2');

    store.deleteRows([0]);
    expect(Array.from({ length: 5 }, (_, r) => store.isRowNew(r))).toEqual([true, true, false, false, false]);
  });

  it('is false for rows of a store that was overridden: ids restart at 0..n-1', () => {
    const store = createCrtStore(makeTable());
    store.override();
    expect(rowIds(store)).toEqual([0, 1, 2]);
    expect([0, 1, 2].map((r) => store.isRowNew(r))).toEqual([false, false, false]);
  });

  it('forgets the new rows and restarts the id counter on reset() and override()', () => {
    const store = createCrtStore(makeTable());
    store.override();
    store.insertRows(0, [['N', '', ''], ['M', '', '']]);
    expect(rowIds(store)).toEqual([3, 4, 0, 1, 2]);

    store.reset();
    expect(rowIds(store)).toEqual([0, 1, 2]);
    expect([0, 1, 2].map((r) => store.isRowNew(r))).toEqual([false, false, false]);

    store.override();
    expect(rowIds(store)).toEqual([0, 1, 2]);
    store.insertRows(3, [['X', '', '']]);
    expect(store.rowId(3)).toBe(3);
    expect(store.isRowNew(3)).toBe(true);
    expect(store.isRowNew(2)).toBe(false);
  });

  it('restarts after reset() on a store loaded with an override too', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(0, [['N', '', '']]);
    store.reset();
    expect(store.rowCount()).toBe(3);
    expect([0, 1, 2].map((r) => store.isRowNew(r))).toEqual([false, false, false]);
    store.override();
    store.insertRows(0, [['N', '', '']]);
    expect(store.rowId(0)).toBe(3);
  });

  it('is false when read only', () => {
    const store = createCrtStore(makeTable());
    expect(store.isRowNew(0)).toBe(false);
  });
});

describe('createCrtStore: edit tracking with new rows', () => {
  it('does not record an edit for a cell of a new row', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(0, [['n0', 'n1', 'n2']]);
    expect(store.setCell(0, 1, 'changed')).toBe(true);
    expect(store.getCell(0, 1)).toBe('changed');
    expect(store.isCellEdited(0, 1)).toBe(false);
    expect(store.changedCellCount()).toBe(0);
  });

  it('tracks an edit of an original row after other rows were inserted before it', () => {
    const store = createCrtStore(makeFour());
    store.setCell(0, 0, 'edited');
    store.insertRows(0, [['n', '', ''], ['m', '', '']]);
    expect(store.isCellEdited(2, 0)).toBe(true);
    expect(store.isCellEdited(0, 0)).toBe(false);
    expect(store.changedCellCount()).toBe(1);
  });

  it('counts only tracked edits of original rows in changedCellCount', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(0, [['n', '', '']]);
    store.setCell(0, 0, 'x');
    store.setCell(1, 0, 'y');
    expect(store.changedCellCount()).toBe(1);
  });

  it('keeps the first original value of a moved row across several edits', () => {
    const store = createCrtStore(makeFour());
    store.setCell(2, 0, 'one');
    store.moveRows([2], -1);
    store.setCell(1, 0, 'two');
    expect(store.changedCellCount()).toBe(1);
    store.setCell(1, 0, 'C0');
    expect(store.changedCellCount()).toBe(0);
  });
});

describe('createCrtStore: dirty with row operations', () => {
  it('is dirty after any successful row operation', () => {
    const insert = createCrtStore(makeFour());
    insert.insertRows(0, [['a', '', '']]);
    expect(insert.isDirty()).toBe(true);

    const remove = createCrtStore(makeFour());
    remove.deleteRows([0]);
    expect(remove.isDirty()).toBe(true);

    const move = createCrtStore(makeFour());
    move.moveRows([1], 1);
    expect(move.isDirty()).toBe(true);

    const grow = createCrtStore(makeFour());
    grow.setCells(3, 0, [['D0'], ['']], true);
    expect(grow.isDirty()).toBe(true);
  });

  it('stays dirty after an insert is deleted again (simplification, not a diff)', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(0, [['a', '', '']]);
    store.deleteRows([0]);
    expect(allRows(store)).toEqual(makeFour().overrideRows);
    expect(store.isDirty()).toBe(true);
  });

  it('is not dirty after refused or empty operations', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(9, [['a', '', '']]);
    store.deleteRows([9]);
    store.moveRows([0], -1);
    store.setCells(9, 0, [['x']], true);
    store.fillCells(9, 9, 9, 9, 'x');
    expect(store.isDirty()).toBe(false);
  });

  it('is cleared by reset()', () => {
    const store = createCrtStore(makeTable());
    store.override();
    store.insertRows(0, [['a', '', '']]);
    store.reset();
    expect(store.isDirty()).toBe(false);
  });

  it('is cleared by override() for the structure change, leaving only the override itself', () => {
    const store = createCrtStore(makeTable());
    store.override();
    store.deleteRows([0]);
    store.reset();
    store.override();
    expect(store.rowCount()).toBe(3);
    expect(store.isDirty()).toBe(true);
    // Undo the override by resetting: nothing from the earlier delete is left behind.
    store.reset();
    expect(store.isDirty()).toBe(false);
  });
});

describe('createCrtStore: row operations together', () => {
  it('keeps ids unique and stable through a mix of operations', () => {
    const store = createCrtStore(makeFour());
    store.insertRows(2, [['N1', '', ''], ['N2', '', '']]);
    store.deleteRows([0]);
    store.moveRows([2], -1);
    store.setCells(store.rowCount() - 1, 0, [['T1'], ['T2']], true);
    const ids = rowIds(store);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, 5).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps the table object untouched', () => {
    const table = makeFour();
    const before = clone(table);
    const store = createCrtStore(table);
    store.insertRows(0, [['a', '', '']]);
    store.moveRows([1], 1);
    store.setCells(0, 0, [['x', 'y']]);
    store.fillCells(0, 0, 1, 1, 'z');
    store.deleteRows([2]);
    expect(table).toEqual(before);
  });
});

describe('createCrtStore: row operation performance (10,000 rows by 20 columns)', () => {
  const MAX_MS = 100;
  const time = (fn: () => void): number => {
    const start = performance.now();
    fn();
    return performance.now() - start;
  };

  it('inserts into a nearly full table quickly', () => {
    const store = createCrtStore(bigTable(9000, 20, true));
    const elapsed = time(() => {
      store.insertRows(4500, Array.from({ length: 1000 }, (_, r) => [`n${r}`]));
    });
    expect(store.rowCount()).toBe(10000);
    expect(store.getCell(4500, 0)).toBe('n0');
    expect(store.getCell(5500, 0)).toBe('o4500-0');
    expect(elapsed).toBeLessThan(MAX_MS);
  });

  it('inserts one row at the top of a 9,999 row table quickly', () => {
    const store = createCrtStore(bigTable(9999, 20, true));
    const elapsed = time(() => {
      expect(store.insertRows(0, [['top']])).toBe(0);
    });
    expect(store.rowCount()).toBe(10000);
    expect(elapsed).toBeLessThan(MAX_MS);
  });

  it('deletes half of the rows quickly, with an edit on every row', () => {
    const store = createCrtStore(bigTable(10000, 20, true));
    for (let r = 0; r < 10000; r++) store.setCell(r, 0, `e${r}`);
    const doomed = Array.from({ length: 5000 }, (_, r) => r * 2);
    let removed = 0;
    const elapsed = time(() => {
      removed = store.deleteRows(doomed);
    });
    expect(removed).toBe(5000);
    expect(store.rowCount()).toBe(5000);
    expect(store.changedCellCount()).toBe(5000);
    expect(store.getCell(0, 0)).toBe('e1');
    expect(elapsed).toBeLessThan(MAX_MS);
  });

  it('moves almost every row up quickly', () => {
    const store = createCrtStore(bigTable(10000, 20, true));
    const selected = Array.from({ length: 9999 }, (_, r) => r + 1);
    let moved: number[] = [];
    const elapsed = time(() => {
      moved = store.moveRows(selected, -1);
    });
    expect(moved).toHaveLength(9999);
    expect(store.getCell(0, 0)).toBe('o1-0');
    expect(store.getCell(9999, 0)).toBe('o0-0');
    expect(elapsed).toBeLessThan(MAX_MS);
  });

  it('moves almost every row down quickly', () => {
    const store = createCrtStore(bigTable(10000, 20, true));
    const selected = Array.from({ length: 9999 }, (_, r) => r);
    const elapsed = time(() => {
      store.moveRows(selected, 1);
    });
    expect(store.getCell(0, 0)).toBe('o9999-0');
    expect(store.getCell(9999, 0)).toBe('o9998-0');
    expect(elapsed).toBeLessThan(MAX_MS);
  });
});
