/**
 * @file crtStore.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Tests for the cross reference table store: loading, normalization, editing,
 * override and reset, dirty tracking, versioning, subscriptions and row ids.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCrtStore } from '../../utils/crt/crtStore';
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
