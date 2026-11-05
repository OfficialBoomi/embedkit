/**
 * @file crtSave.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Tests for the rules behind saving a cross reference table: what Save does, the size of the
 * request, and what a save does to the processes that share the table. How a failed save reads is
 * in crtSaveError.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  checkSaveSize,
  DEFAULT_MAX_SAVE_BYTES,
  describeSaveAction,
  describeShareTargets,
  estimateSaveBytes,
  sameRows,
  type ShareCandidate,
} from '../../utils/crt/crtSave';
import type { CrtChangeSummary } from '../../utils/crt/crtStore';

const summary = (patch: Partial<CrtChangeSummary> = {}): CrtChangeSummary => ({
  loadedOverridden: false,
  overridden: false,
  added: 0,
  edited: 0,
  removed: 0,
  reordered: false,
  ...patch,
});

describe('describeSaveAction', () => {
  it('nothing to save when nothing differs from the load', () => {
    expect(describeSaveAction(summary(), 3, false)).toEqual({ mode: 'none', text: 'No changes to save' });
    expect(describeSaveAction(summary({ loadedOverridden: true, overridden: true }), 3, false)).toEqual({
      mode: 'none',
      text: 'No changes to save',
    });
  });

  it('a table with no rows of its own that now has them: save creates the customer copy', () => {
    const s = summary({ overridden: true });
    expect(describeSaveAction(s, 12, true)).toEqual({ mode: 'save', text: 'Save will create your own copy (12 rows)' });
  });

  it('the new copy also says how many rows were changed from the defaults', () => {
    const s = summary({ overridden: true, added: 1, edited: 2, removed: 3 });
    expect(describeSaveAction(s, 12, true).text).toBe('Save will create your own copy (12 rows), 6 rows changed');
    expect(describeSaveAction(summary({ overridden: true, edited: 1 }), 12, true).text).toBe(
      'Save will create your own copy (12 rows), 1 row changed'
    );
  });

  it('a new copy of only reordered rows has no changed-rows part', () => {
    expect(describeSaveAction(summary({ overridden: true, reordered: true }), 4, true).text).toBe(
      'Save will create your own copy (4 rows)'
    );
  });

  it('says 1 row, not 1 rows, and handles an empty copy', () => {
    expect(describeSaveAction(summary({ overridden: true }), 1, true).text).toBe('Save will create your own copy (1 row)');
    expect(describeSaveAction(summary({ overridden: true }), 0, true).text).toBe('Save will create your own copy (0 rows)');
  });

  it('thousands of rows get a thousands separator', () => {
    expect(describeSaveAction(summary({ overridden: true, edited: 1500 }), 10000, true).text).toBe(
      'Save will create your own copy (10,000 rows), 1,500 rows changed'
    );
  });

  it('rows of its own that are given up: save restores the defaults (a reset)', () => {
    expect(describeSaveAction(summary({ loadedOverridden: true }), 3, true)).toEqual({
      mode: 'reset',
      text: 'Save will restore the default values',
    });
  });

  it('rows of its own that are still its own: save says how many rows changed', () => {
    const base = { loadedOverridden: true, overridden: true };
    expect(describeSaveAction(summary({ ...base, edited: 3 }), 9, true)).toEqual({ mode: 'save', text: '3 rows changed' });
    expect(describeSaveAction(summary({ ...base, added: 1, edited: 1, removed: 1 }), 9, true).text).toBe('3 rows changed');
    expect(describeSaveAction(summary({ ...base, edited: 1 }), 9, true).text).toBe('1 row changed');
    expect(describeSaveAction(summary({ ...base, removed: 1 }), 9, true).text).toBe('1 row changed');
  });

  it('only the order changed', () => {
    expect(describeSaveAction(summary({ loadedOverridden: true, overridden: true, reordered: true }), 9, true)).toEqual({
      mode: 'save',
      text: 'Row order changed',
    });
  });

  it('a changed row count wins over a changed order', () => {
    const s = summary({ loadedOverridden: true, overridden: true, reordered: true, removed: 2 });
    expect(describeSaveAction(s, 9, true).text).toBe('2 rows changed');
  });

  it('rows of its own, reset and then overridden again: the rows are a fresh copy of the defaults', () => {
    const s = summary({ loadedOverridden: true, overridden: true });
    expect(describeSaveAction(s, 9, true)).toEqual({
      mode: 'save',
      text: 'Save will replace your rows with a copy of the default values',
    });
  });

  it('a table that was never overridden and is not now has nothing to do, whatever dirty says', () => {
    expect(describeSaveAction(summary(), 3, true).mode).toBe('none');
  });
});

/** The bytes the request carries for these rows, the slow and obviously right way. */
const reference = (rows: string[][]): number => new TextEncoder().encode(JSON.stringify(rows)).length;

describe('estimateSaveBytes', () => {
  it('an empty table and empty rows', () => {
    expect(estimateSaveBytes([])).toBe(2);
    expect(estimateSaveBytes([[]])).toBe(reference([[]]));
    expect(estimateSaveBytes([[], [], []])).toBe(reference([[], [], []]));
  });

  it('plain tables, with blank cells', () => {
    for (const rows of [[['a', 'b']], [['a', 'b'], ['c', 'd']], [['', '']], [['', ''], ['', '']], [['only']]]) {
      expect(estimateSaveBytes(rows)).toBe(reference(rows));
    }
  });

  it('quotes, backslashes, tabs and newlines', () => {
    const rows = [
      ['say "hi"', 'back\\slash'],
      ['tab\there', 'line\nbreak'],
      ['\r\n', '\\"'],
      ['"', '\\'],
    ];
    expect(estimateSaveBytes(rows)).toBe(reference(rows));
  });

  it('every control character, and the characters just around them', () => {
    const controls = Array.from({ length: 0x80 }, (_, i) => String.fromCharCode(i));
    const rows = [controls, [controls.join('')], [String.fromCharCode(0x7f), '\u0080', '\u00ff']];
    expect(estimateSaveBytes(rows)).toBe(reference(rows));
  });

  it('multi byte text: accents, other scripts, symbols, emoji', () => {
    const rows = [
      ['caf\u00e9', 'na\u00efve', '\u00fc\u00f1\u00ee\u00e7\u00f8d\u00e9'],
      ['\u4e2d\u6587', '\u65e5\u672c\u8a9e', '\ud55c\uad6d\uc5b4', '\u0645\u0631\u062d\u0628\u0627'],
      ['\u20ac \u2122 \u2603', '\u2028\u2029', '\ufeff'],
      ['\ud83d\ude00', '\ud83d\udc69\u200d\ud83d\udcbb', 'a\ud83d\ude00b'],
      ['\u07ff', '\u0800', '\uffff', '\u0080'],
    ];
    expect(estimateSaveBytes(rows)).toBe(reference(rows));
  });

  it('lone surrogate halves are written as escapes, like JSON.stringify does', () => {
    const rows = [
      ['\ud800', '\udc00', '\ud800x', 'x\udc00'],
      ['\ud83d\ud83d\ude00', '\ude00\ud83d', '\udbff\udfff', '\ud800\ud800'],
    ];
    expect(estimateSaveBytes(rows)).toBe(reference(rows));
  });

  it('long cells', () => {
    const rows = [['x'.repeat(500000), '\u00e9'.repeat(100000)], ['\ud83d\ude00'.repeat(50000), '"'.repeat(10000)]];
    expect(estimateSaveBytes(rows)).toBe(reference(rows));
  });

  it('any mix of characters, including every kind of code unit', () => {
    let state = 12345;
    const next = (n: number): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return Math.floor((state / 4294967296) * n);
    };
    const units = [0x00, 0x08, 0x1f, 0x20, 0x22, 0x5c, 0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000, 0xffff];
    for (let round = 0; round < 40; round++) {
      const rows = Array.from({ length: next(6) }, () =>
        Array.from({ length: next(5) }, () =>
          Array.from({ length: next(8) }, () => String.fromCharCode(next(3) === 0 ? units[next(units.length)] : next(0x10000))).join('')
        )
      );
      expect(estimateSaveBytes(rows)).toBe(reference(rows));
    }
  });

  it('a table of the largest supported size, without building its text', () => {
    const rows = Array.from({ length: 10000 }, (_, r) => Array.from({ length: 20 }, (_, c) => `value ${r}-${c} "q"`));
    expect(estimateSaveBytes(rows)).toBe(reference(rows));
  });
});

describe('checkSaveSize', () => {
  const MB = 1024 * 1024;
  /** One row with one cell of exactly this many bytes in total once written. */
  const rowsOfBytes = (total: number): string[][] => [['x'.repeat(total - 6)]];

  it('is null when the rows fit', () => {
    expect(checkSaveSize([['a', 'b']], 8 * MB)).toBeNull();
    expect(checkSaveSize([], 8 * MB)).toBeNull();
  });

  it('is null exactly at the limit and a message one byte over', () => {
    expect(estimateSaveBytes(rowsOfBytes(1000))).toBe(1000);
    expect(checkSaveSize(rowsOfBytes(1000), 1000)).toBeNull();
    expect(checkSaveSize(rowsOfBytes(1001), 1000)).not.toBeNull();
  });

  it('uses 1 MB when the server did not say', () => {
    expect(DEFAULT_MAX_SAVE_BYTES).toBe(MB);
    expect(checkSaveSize(rowsOfBytes(MB))).toBeNull();
    expect(checkSaveSize(rowsOfBytes(MB + 1))).toContain('over the 1 MB limit');
    for (const bad of [undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(checkSaveSize(rowsOfBytes(MB + 1), bad as number)).toContain('over the 1 MB limit');
    }
  });

  it('says how big the table is and what the limit is, in plain words', () => {
    const message = checkSaveSize(rowsOfBytes(Math.round(9.4 * MB)), 8 * MB);
    expect(message).toBe(
      'This table is about 9.4 MB, which is over the 8 MB limit for saving. Remove some rows or shorten long values.'
    );
  });

  it('shows a limit that is not a whole number of megabytes with one decimal', () => {
    expect(checkSaveSize(rowsOfBytes(3 * MB), 2.5 * MB)).toContain('about 3.0 MB, which is over the 2.5 MB limit');
  });

  it('a table just over the limit does not read as equal to it', () => {
    const message = checkSaveSize(rowsOfBytes(8 * MB + 20000), 8 * MB) as string;
    expect(message).toContain('about 8.02 MB, which is over the 8 MB limit');
  });

  it('small limits are shown in kilobytes', () => {
    expect(checkSaveSize(rowsOfBytes(2048), 1024)).toBe(
      'This table is about 2.0 KB, which is over the 1 KB limit for saving. Remove some rows or shorten long values.'
    );
  });

  it('has no dash, no ids and no cell text in the message', () => {
    const message = checkSaveSize([['secret-value-xyz'.repeat(100)]], 100) as string;
    expect(message).not.toContain('secret');
    expect(message).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('sameRows', () => {
  it('compares cell by cell', () => {
    expect(sameRows([['a', 'b']], [['a', 'b']])).toBe(true);
    expect(sameRows([], [])).toBe(true);
    expect(sameRows([['a', 'b']], [['a', 'c']])).toBe(false);
    expect(sameRows([['a', 'b']], [['a', 'b'], ['c', 'd']])).toBe(false);
    expect(sameRows([['a', 'b']], [['a']])).toBe(false);
    expect(sameRows([['a', 'b'], ['c', 'd']], [['c', 'd'], ['a', 'b']])).toBe(false);
    expect(sameRows([['a', '']], [['a', ' ']])).toBe(false);
  });
});

const open = { processId: 'p1', tableId: 't1' };
const rowsA = [['1', 'one'], ['2', 'two']];

const candidate = (patch: Partial<ShareCandidate> = {}): ShareCandidate => ({
  processId: 'p2',
  processName: 'Second',
  overridden: false,
  rows: [],
  hasUnsavedEdits: false,
  unavailable: false,
  ...patch,
});

describe('describeShareTargets: save', () => {
  it('a process on the publisher defaults gets its own copy', () => {
    expect(describeShareTargets(open, 'save', rowsA, [candidate()])).toEqual([
      {
        processId: 'p2',
        processName: 'Second',
        kind: 'creates-copy',
        text: 'Uses the publisher defaults and will get its own copy.',
        willChange: true,
      },
    ]);
  });

  it('a process with different rows of its own has them replaced', () => {
    const [t] = describeShareTargets(open, 'save', rowsA, [candidate({ overridden: true, rows: [['9', 'nine']] })]);
    expect(t).toMatchObject({ kind: 'replaces-own-rows', text: 'Has its own different rows, which will be replaced.', willChange: true });
  });

  it('a process that already has exactly these rows needs no write', () => {
    const [t] = describeShareTargets(open, 'save', rowsA, [candidate({ overridden: true, rows: [['1', 'one'], ['2', 'two']] })]);
    expect(t).toMatchObject({ kind: 'already-has-rows', text: 'Already has these rows.', willChange: false });
  });

  it('rows that differ in order, length or a single cell are different', () => {
    for (const rows of [[['2', 'two'], ['1', 'one']], [['1', 'one']], [['1', 'one'], ['2', 'twO']], [['1', 'one'], ['2', 'two'], ['3', 'three']]]) {
      const [t] = describeShareTargets(open, 'save', rowsA, [candidate({ overridden: true, rows })]);
      expect(t.kind).toBe('replaces-own-rows');
    }
  });

  it('an empty override and empty rows are the same', () => {
    const [t] = describeShareTargets(open, 'save', [], [candidate({ overridden: true, rows: [] })]);
    expect(t.kind).toBe('already-has-rows');
  });

  it('a process with unsaved edits has them replaced, and always changes', () => {
    const same = candidate({ overridden: true, rows: rowsA, hasUnsavedEdits: true });
    const defaults = candidate({ overridden: false, hasUnsavedEdits: true });
    for (const c of [same, defaults]) {
      const [t] = describeShareTargets(open, 'save', rowsA, [c]);
      expect(t).toMatchObject({ kind: 'has-edits', text: 'Has unsaved changes, which will be replaced.', willChange: true });
    }
  });
});

describe('describeShareTargets: reset', () => {
  it('a process with its own rows goes back to the defaults', () => {
    const [t] = describeShareTargets(open, 'reset', [], [candidate({ overridden: true, rows: rowsA })]);
    expect(t).toMatchObject({ kind: 'restores-defaults', text: 'Has its own rows, which will go back to the defaults.', willChange: true });
  });

  it('a process on the defaults needs no write', () => {
    const [t] = describeShareTargets(open, 'reset', [], [candidate()]);
    expect(t).toMatchObject({ kind: 'already-defaults', text: 'Already uses the defaults.', willChange: false });
  });

  it('a process with unsaved edits has them replaced, and always changes', () => {
    const [t] = describeShareTargets(open, 'reset', [], [candidate({ hasUnsavedEdits: true })]);
    expect(t).toMatchObject({ kind: 'has-edits', willChange: true });
  });

  it('the rows of the open table do not matter', () => {
    const [t] = describeShareTargets(open, 'reset', rowsA, [candidate({ overridden: true, rows: rowsA })]);
    expect(t.kind).toBe('restores-defaults');
  });
});

describe('describeShareTargets: which processes', () => {
  it('leaves out a process where the table cannot be edited, and the open process', () => {
    const list = describeShareTargets(open, 'save', rowsA, [
      candidate({ processId: 'p2', processName: 'Two', unavailable: true }),
      candidate({ processId: 'p1', processName: 'Open one' }),
      candidate({ processId: 'p3', processName: 'Three' }),
    ]);
    expect(list.map((t) => t.processId)).toEqual(['p3']);
  });

  it('keeps the order it was given and says one thing per process', () => {
    const list = describeShareTargets(open, 'save', rowsA, [
      candidate({ processId: 'p4', processName: 'Four', overridden: true, rows: rowsA }),
      candidate({ processId: 'p2', processName: 'Two' }),
      candidate({ processId: 'p3', processName: 'Three', hasUnsavedEdits: true }),
    ]);
    expect(list.map((t) => [t.processId, t.kind])).toEqual([
      ['p4', 'already-has-rows'],
      ['p2', 'creates-copy'],
      ['p3', 'has-edits'],
    ]);
  });

  it('gives nothing when there is no other process', () => {
    expect(describeShareTargets(open, 'save', rowsA, [])).toEqual([]);
  });

  it('does not change what it was given', () => {
    const others = [candidate({ overridden: true, rows: [['9', 'nine']] })];
    const copy = JSON.parse(JSON.stringify(others));
    describeShareTargets(open, 'save', rowsA, others);
    expect(others).toEqual(copy);
  });
});
