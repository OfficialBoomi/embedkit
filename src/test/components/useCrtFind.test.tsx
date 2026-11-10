/**
 * @file useCrtFind.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The find and replace state of the screen, driven over a real store and a stand-in for the grid
 * handle, with fake timers for the 200 ms debounce: live search after the query, an option or the
 * table changes, the match that becomes current, stepping (wrapping, and running a waiting search
 * first), refreshing after an edit, an undo or a replace without moving the cursor, Replace and
 * Replace all as one undo step each, a table that cannot be edited, and closing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createCrtStore, type CrtStore } from '../../utils/crt/crtStore';
import type { CrtTableData } from '../../utils/crt/crtTypes';
import { useCrtFind } from '../../components/integration/crt/useCrtFind';
import type { CrtGridHandle } from '../../components/integration/crt/crtGridTypes';

const DEBOUNCE = 200;

const makeTable = (rows: number, overridden = true, cols = 3): CrtTableData => {
  const data = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (c === 0 ? `k${r}` : c === 1 ? `v${r}` : `w${r}`))
  );
  return {
    id: 't',
    name: 'Codes',
    processId: 'p',
    processName: 'Process',
    matchType: 'exact',
    columns: Array.from({ length: cols }, (_, c) => `Col ${c}`),
    defaultRows: overridden ? [] : data,
    overrideRows: overridden ? data : null,
  };
};

/** A stand-in for the grid handle that remembers where the active cell is. */
function makeGrid() {
  let active = { row: 0, col: 0 };
  const grid = {
    run: vi.fn(),
    focus: vi.fn(),
    commitEdit: vi.fn(),
    activeCell: vi.fn(() => active),
    showCell: vi.fn((row: number, col: number) => {
      active = { row, col };
    }),
    setActive: (row: number, col: number) => {
      active = { row, col };
    },
  };
  return grid;
}

function setup(opts: { rows?: number; overridden?: boolean; store?: CrtStore | null } = {}) {
  const store = opts.store === undefined ? createCrtStore(makeTable(opts.rows ?? 12, opts.overridden ?? true)) : opts.store;
  const grid = makeGrid();
  const gridRef = { current: grid as unknown as CrtGridHandle };
  const onNotice = vi.fn();
  const onBlocked = vi.fn();
  const hook = renderHook(
    ({ s }: { s: CrtStore | null }) => useCrtFind(s, gridRef, { onNotice, onBlocked }),
    { initialProps: { s: store } }
  );
  const find = () => hook.result.current;
  const open = () => act(() => find().onCommand('open'));
  const type = (q: string) => act(() => find().bar.onQueryChange(q));
  const settle = (ms = DEBOUNCE) => act(() => void vi.advanceTimersByTime(ms));
  /** Opens, types a query and lets the search run. */
  const search = (q: string) => {
    open();
    type(q);
    settle();
  };
  const toggle = (option: 'matchCase' | 'wholeCell' | 'regex') => act(() => find().bar.onToggleOption(option));
  const step = (d: 1 | -1) => act(() => find().bar.onStep(d));
  // Only the one test that passes null looks at a missing store; every other test reads a real one.
  return { store: store as CrtStore, grid, gridRef, onNotice, onBlocked, hook, find, open, type, settle, search, toggle, step };
}

/** How many matches the bar reports, read from the status text ('3 of 12' gives 12). */
const countOf = (status: string): number => Number(status.replace(/,/g, '').match(/of (\d+)/)?.[1] ?? status.match(/^(\d+)/)?.[1] ?? 0);

describe('useCrtFind: opening and closing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts closed, with nothing to draw', () => {
    const h = setup();
    expect(h.find().open).toBe(false);
    expect(h.find().highlight).toBeUndefined();
    expect(h.find().bar.query).toBe('');
    expect(h.find().bar.status).toBe('');
  });

  it('opens on the open command and asks the row to take focus each time', () => {
    const h = setup();
    const first = h.find().bar.focusToken;
    h.open();
    expect(h.find().open).toBe(true);
    const second = h.find().bar.focusToken;
    expect(second).not.toBe(first);
    h.open();
    expect(h.find().open).toBe(true);
    expect(h.find().bar.focusToken).not.toBe(second);
  });

  it('F3 on a closed row opens it instead of stepping', () => {
    const h = setup();
    act(() => h.find().onCommand('next'));
    expect(h.find().open).toBe(true);
    expect(h.grid.showCell).not.toHaveBeenCalled();
  });

  it('the Find button toggles', () => {
    const h = setup();
    act(() => h.find().toggle());
    expect(h.find().open).toBe(true);
    act(() => h.find().toggle());
    expect(h.find().open).toBe(false);
  });

  it('closing clears the query, the replacement, the options and the highlights, and gives focus to the grid', () => {
    const h = setup();
    h.search('v1');
    act(() => h.find().bar.onReplacementChange('zz'));
    h.toggle('matchCase');
    h.toggle('regex');
    expect(h.find().highlight).toBeDefined();
    act(() => h.find().bar.onClose());
    expect(h.find().open).toBe(false);
    expect(h.find().bar.query).toBe('');
    expect(h.find().bar.replacement).toBe('');
    expect(h.find().bar.options).toEqual({ matchCase: false, wholeCell: false, regex: false });
    expect(h.find().highlight).toBeUndefined();
    expect(h.find().bar.status).toBe('');
    expect(h.grid.focus).toHaveBeenCalledTimes(1);
  });

  it('closing drops a search that is still waiting', () => {
    const h = setup();
    h.open();
    h.type('v1');
    act(() => h.find().bar.onClose());
    h.settle(1000);
    expect(h.find().highlight).toBeUndefined();
    expect(h.grid.showCell).not.toHaveBeenCalled();
  });

  it('reopening starts clean', () => {
    const h = setup();
    h.search('v1');
    act(() => h.find().bar.onClose());
    h.open();
    h.settle();
    expect(h.find().bar.query).toBe('');
    expect(h.find().highlight).toBeUndefined();
  });

  it('leaves no timer behind when the screen goes away', () => {
    const h = setup();
    h.open();
    h.type('v1');
    h.hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lets go of the store when it closes and when the screen goes away', () => {
    const store = createCrtStore(makeTable(5));
    const real = store.subscribe;
    let live = 0;
    store.subscribe = (listener) => {
      live += 1;
      const off = real(listener);
      let done = false;
      return () => {
        if (!done) live -= 1;
        done = true;
        off();
      };
    };
    const h = setup({ store });
    expect(live).toBe(0);
    h.open();
    expect(live).toBe(1);
    act(() => h.find().bar.onClose());
    expect(live).toBe(0);
    h.open();
    expect(live).toBe(1);
    h.hook.unmount();
    expect(live).toBe(0);
  });
});

describe('useCrtFind: live search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the debounce, then shows the first match at or after the active cell and moves the grid there', () => {
    const h = setup();
    h.open();
    h.type('v1');
    h.settle(DEBOUNCE - 1);
    expect(h.find().bar.status).toBe('');
    expect(h.find().highlight).toBeUndefined();
    expect(h.grid.showCell).not.toHaveBeenCalled();
    h.settle(1);
    // v1, v10 and v11 match; the active cell is the top left, so the first one is current.
    expect(h.find().bar.status).toBe('1 of 3');
    expect(h.grid.showCell).toHaveBeenCalledTimes(1);
    expect(h.grid.showCell).toHaveBeenCalledWith(1, 1);
    expect(h.find().highlight?.current).toEqual({ row: 1, col: 1 });
  });

  it('keeps typing in one search: each key restarts the wait', () => {
    const h = setup();
    h.open();
    h.type('v');
    h.settle(150);
    h.type('v1');
    h.settle(150);
    expect(h.find().bar.status).toBe('');
    h.settle(50);
    expect(h.find().bar.status).toBe('1 of 3');
    expect(h.grid.showCell).toHaveBeenCalledTimes(1);
  });

  it('starts from the active cell, not from the top', () => {
    const h = setup();
    h.grid.setActive(5, 0);
    h.search('v');
    // Column 1 matches in every row; the first at or after (5, 0) is (5, 1).
    expect(h.find().highlight?.current).toEqual({ row: 5, col: 1 });
    expect(h.find().bar.status).toBe('6 of 12');
  });

  it('wraps to the first match when the active cell is past the last one', () => {
    const h = setup();
    h.grid.setActive(11, 2);
    h.search('v');
    expect(h.find().highlight?.current).toEqual({ row: 0, col: 1 });
    expect(h.find().bar.status).toBe('1 of 12');
  });

  it('says No matches and highlights nothing', () => {
    const h = setup();
    h.search('nothing like this');
    expect(h.find().bar.status).toBe('No matches');
    expect(h.find().highlight).toBeUndefined();
    expect(h.find().bar.hasMatches).toBe(false);
    expect(h.grid.showCell).not.toHaveBeenCalled();
  });

  it('shows nothing while the first characters of a query are still waiting', () => {
    const h = setup();
    h.open();
    h.type('x');
    expect(h.find().bar.status).toBe('');
  });

  it('an empty query clears at once, without waiting', () => {
    const h = setup();
    h.search('v1');
    expect(h.find().highlight).toBeDefined();
    h.type('');
    expect(h.find().highlight).toBeUndefined();
    expect(h.find().bar.status).toBe('');
    expect(h.find().bar.hasMatches).toBe(false);
  });

  it('builds one mask number per matching row', () => {
    const h = setup();
    h.search('1');
    // k1 v1 w1, k10 v10 w10, k11 v11 w11 all match in every column.
    const masks = h.find().highlight?.masks as ReadonlyMap<number, number>;
    expect(masks.get(1)).toBe(0b111);
    expect(masks.get(10)).toBe(0b111);
    expect(masks.get(11)).toBe(0b111);
    expect(masks.has(0)).toBe(false);
    expect(masks.size).toBe(3);
  });

  it('hands the grid the same highlight object until something changes', () => {
    const h = setup();
    h.search('v1');
    const before = h.find().highlight;
    act(() => h.find().bar.onReplacementChange('r'));
    expect(h.find().highlight).toBe(before);
    h.hook.rerender({ s: h.store });
    expect(h.find().highlight).toBe(before);
  });

  it('searches again when an option changes, with the new rules', () => {
    const store = createCrtStore({
      ...makeTable(0),
      overrideRows: [['Apple', 'apple'], ['apple', 'APPLE'], ['pear', 'x']],
      columns: ['A', 'B'],
    });
    const h = setup({ store });
    h.search('apple');
    expect(h.find().bar.status).toBe('1 of 4');
    h.toggle('matchCase');
    h.settle();
    expect(h.find().bar.status).toBe('1 of 2');
    h.toggle('wholeCell');
    h.settle();
    expect(h.find().bar.status).toBe('1 of 2');
    // A new search starts from the active cell, which the earlier searches moved; start from the top again.
    h.grid.setActive(0, 0);
    h.toggle('matchCase');
    h.settle();
    expect(h.find().bar.status).toBe('1 of 4');
    h.type('^a');
    h.toggle('regex');
    h.settle();
    // Whole cell with a regex: the whole cell must match ^a, which none of them does.
    expect(h.find().bar.status).toBe('No matches');
  });

  it('an invalid regular expression says so, marks the box and highlights nothing', () => {
    const h = setup();
    h.open();
    h.toggle('regex');
    h.type('(');
    h.settle();
    expect(h.find().bar.status).toBe('Invalid regular expression');
    expect(h.find().bar.invalid).toBe(true);
    expect(h.find().highlight).toBeUndefined();
    expect(h.find().bar.hasMatches).toBe(false);
    h.type('v1');
    h.settle();
    expect(h.find().bar.invalid).toBe(false);
    expect(h.find().bar.status).toBe('1 of 3');
  });

  it('refuses a pattern that could take too long, says so, marks the box and highlights nothing', () => {
    const h = setup();
    h.open();
    h.toggle('regex');
    h.type('(v+)+$');
    h.settle();
    expect(h.find().bar.status).toBe('This pattern could take too long to run. Try a simpler one.');
    expect(h.find().bar.invalid).toBe(true);
    expect(h.find().highlight).toBeUndefined();
    expect(h.find().bar.hasMatches).toBe(false);
    // The same characters with Regex off are plain text and are simply not found.
    h.toggle('regex');
    h.settle();
    expect(h.find().bar.invalid).toBe(false);
    expect(h.find().bar.status).toBe('No matches');
    // A simpler pattern works again.
    h.toggle('regex');
    h.type('v+1');
    h.settle();
    expect(h.find().bar.invalid).toBe(false);
    expect(h.find().bar.status).toBe('1 of 3');
  });

  it('reports a search that ran out of time as partial and keeps what it found', () => {
    const h = setup({ rows: 12 });
    // Every read of the clock is 500 ms later than the last, so the scan stops after its first row.
    let t = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => (t += 500));
    try {
      h.search('v');
    } finally {
      clock.mockRestore();
    }
    expect(h.find().bar.status).toBe('Search stopped early, the table is large or the pattern is slow');
    expect(h.find().bar.invalid).toBe(false);
    expect(h.find().bar.hasMatches).toBe(true);
    expect(h.find().highlight?.current).toEqual({ row: 0, col: 1 });
    // With a normal clock the same search is whole again.
    h.type('v1');
    h.settle();
    expect(h.find().bar.status).toBe('1 of 3');
  });

  it('formats a long count with a thousands separator and shows a plus when the search was cut', () => {
    const rows = Array.from({ length: 2600 }, () => ['x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'x']);
    const big = createCrtStore({ ...makeTable(0, true, 20), overrideRows: rows });
    const h = setup({ store: big });
    h.search('x');
    // 2,600 rows by 20 columns is 52,000 matching cells, past the 50,000 the search reports.
    expect(h.find().bar.status).toBe('1 of 50,000+ matches');
  });

  it('does nothing without a table', () => {
    const h = setup({ store: null });
    h.search('v1');
    expect(h.find().highlight).toBeUndefined();
    expect(h.find().bar.status).toBe('');
    expect(h.find().bar.canReplace).toBe(false);
  });
});

describe('useCrtFind: stepping', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const at = (h: ReturnType<typeof setup>) => h.find().highlight?.current;

  it('steps forward and wraps, moving the grid each time', () => {
    const h = setup();
    h.search('v1');
    expect(at(h)).toEqual({ row: 1, col: 1 });
    h.step(1);
    expect(at(h)).toEqual({ row: 10, col: 1 });
    expect(h.find().bar.status).toBe('2 of 3');
    h.step(1);
    expect(at(h)).toEqual({ row: 11, col: 1 });
    h.step(1);
    expect(at(h)).toEqual({ row: 1, col: 1 });
    expect(h.find().bar.status).toBe('1 of 3');
    expect(h.grid.showCell).toHaveBeenLastCalledWith(1, 1);
  });

  it('steps back and wraps', () => {
    const h = setup();
    h.search('v1');
    h.step(-1);
    expect(at(h)).toEqual({ row: 11, col: 1 });
    expect(h.find().bar.status).toBe('3 of 3');
    h.step(-1);
    expect(at(h)).toEqual({ row: 10, col: 1 });
  });

  it('F3 and Shift+F3 step the same way once the row is open', () => {
    const h = setup();
    h.search('v1');
    act(() => h.find().onCommand('next'));
    expect(at(h)).toEqual({ row: 10, col: 1 });
    act(() => h.find().onCommand('prev'));
    expect(at(h)).toEqual({ row: 1, col: 1 });
    act(() => h.find().onCommand('prev'));
    expect(at(h)).toEqual({ row: 11, col: 1 });
  });

  it('runs a search that is still waiting before it steps', () => {
    const h = setup();
    h.open();
    h.type('v1');
    // No time has passed: the matches are not there yet. Enter must search first, then go on to the next.
    h.step(1);
    expect(h.find().bar.status).toBe('2 of 3');
    expect(at(h)).toEqual({ row: 10, col: 1 });
    h.settle(1000);
    expect(h.find().bar.status).toBe('2 of 3');
  });

  it('does nothing without matches', () => {
    const h = setup();
    h.search('zzz');
    h.step(1);
    h.step(-1);
    expect(h.grid.showCell).not.toHaveBeenCalled();
    expect(h.find().bar.status).toBe('No matches');
  });

  it('never takes focus: it asks the grid to show the cell and nothing else', () => {
    const h = setup();
    h.search('v1');
    h.step(1);
    expect(h.grid.focus).not.toHaveBeenCalled();
    expect(h.grid.run).not.toHaveBeenCalled();
    const token = h.find().bar.focusToken;
    h.step(1);
    expect(h.find().bar.focusToken).toBe(token);
  });

  it('the grid stays on the cell the step chose, so the next search starts from there', () => {
    const h = setup();
    h.search('v1');
    h.step(1);
    expect(h.grid.activeCell()).toEqual({ row: 10, col: 1 });
    h.type('v');
    h.settle();
    // A new query: first match at or after the active cell (10, 1), which is itself a match for v.
    expect(at(h)).toEqual({ row: 10, col: 1 });
  });
});

describe('useCrtFind: the table changes under the search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('searches again about 200 ms after an edit, and does not move the cursor', () => {
    const h = setup();
    h.search('v1');
    h.step(1);
    h.grid.showCell.mockClear();
    act(() => void h.store.setCell(4, 1, 'v1 too'));
    // Nothing yet: the old result still shows.
    h.settle(DEBOUNCE - 1);
    expect(h.find().bar.status).toBe('2 of 3');
    h.settle(1);
    expect(h.find().bar.status).toBe('2 of 4');
    expect(h.grid.showCell).not.toHaveBeenCalled();
    const masks = h.find().highlight?.masks as ReadonlyMap<number, number>;
    expect(masks.get(4)).toBe(0b10);
  });

  it('keeps the position when it is still valid and clamps it when the list got shorter', () => {
    const h = setup();
    h.search('v1');
    h.step(1);
    h.step(1);
    expect(h.find().bar.status).toBe('3 of 3');
    // Two matches disappear: the position clamps to the last one.
    act(() => {
      h.store.setCell(1, 1, 'gone');
      h.store.setCell(10, 1, 'gone');
    });
    h.settle();
    expect(h.find().bar.status).toBe('1 of 1');
    expect(h.find().highlight?.current).toEqual({ row: 11, col: 1 });
  });

  it('picks the first match when the edit created the first match of a search that had none', () => {
    const h = setup();
    h.search('needle');
    expect(h.find().bar.status).toBe('No matches');
    act(() => void h.store.setCell(3, 2, 'a needle'));
    h.settle();
    expect(h.find().bar.status).toBe('1 of 1');
    expect(h.find().highlight?.current).toEqual({ row: 3, col: 2 });
    expect(h.grid.showCell).not.toHaveBeenCalled();
  });

  it('searches again after an undo and a redo', () => {
    const h = setup();
    h.search('v1');
    act(() => void h.store.setCell(4, 1, 'v1 too'));
    h.settle();
    expect(countOf(h.find().bar.status)).toBe(4);
    act(() => void h.store.undo());
    h.settle();
    expect(countOf(h.find().bar.status)).toBe(3);
    act(() => void h.store.redo());
    h.settle();
    expect(countOf(h.find().bar.status)).toBe(4);
  });

  it('several quick edits cost one search', () => {
    const h = setup();
    h.search('v1');
    const spy = vi.spyOn(h.store, 'getCell');
    act(() => {
      h.store.setCell(0, 0, 'a');
      h.store.setCell(0, 1, 'b');
      h.store.setCell(0, 2, 'c');
    });
    h.settle(100);
    act(() => void h.store.setCell(1, 0, 'd'));
    h.settle(DEBOUNCE - 1);
    expect(spy).not.toHaveBeenCalled();
    h.settle(1);
    // One scan of 12 rows by 3 columns.
    expect(spy.mock.calls.length).toBe(36);
  });

  it('does not search for a store change while the query is empty', () => {
    const h = setup();
    h.open();
    const spy = vi.spyOn(h.store, 'getCell');
    act(() => void h.store.setCell(0, 0, 'x'));
    h.settle(1000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps the query and the options on another table and searches that one', () => {
    const second = createCrtStore({
      ...makeTable(0),
      overrideRows: [['alpha', 'v1'], ['beta', 'v1'], ['gamma', 'x']],
      columns: ['A', 'B'],
    });
    const h = setup();
    h.search('v1');
    h.toggle('matchCase');
    h.settle();
    expect(h.find().bar.status).toBe('1 of 3');
    h.hook.rerender({ s: second });
    // The real grid starts a new table at the top left; the stand-in has to do the same.
    h.grid.setActive(0, 0);
    // Nothing from the old table shows on the new one while the search waits.
    expect(h.find().highlight).toBeUndefined();
    expect(h.find().bar.status).toBe('');
    expect(h.find().bar.query).toBe('v1');
    expect(h.find().bar.options.matchCase).toBe(true);
    h.settle();
    expect(h.find().bar.status).toBe('1 of 2');
    expect(h.find().highlight?.current).toEqual({ row: 0, col: 1 });
    expect(h.grid.showCell).toHaveBeenLastCalledWith(0, 1);
  });

  it('stops watching the old table and watches the new one', () => {
    const second = createCrtStore(makeTable(4));
    const h = setup();
    h.search('v1');
    h.hook.rerender({ s: second });
    h.settle();
    const spy = vi.spyOn(h.store, 'getCell');
    act(() => void h.store.setCell(0, 0, 'edited on the old table'));
    h.settle(1000);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('useCrtFind: Replace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const replaceWith = (h: ReturnType<typeof setup>, text: string) => act(() => h.find().bar.onReplacementChange(text));
  const replace = (h: ReturnType<typeof setup>) => act(() => h.find().bar.onReplace());

  it('replaces the current match as one undo step labelled Replace, then moves to the next match', () => {
    const h = setup();
    h.search('v1');
    replaceWith(h, 'X');
    replace(h);
    expect(h.store.getCell(1, 1)).toBe('X');
    expect(h.store.undoLabel()).toBe('Replace');
    // The replaced cell no longer matches, so two are left and the next one is current.
    expect(h.find().bar.status).toBe('1 of 2');
    expect(h.find().highlight?.current).toEqual({ row: 10, col: 1 });
    expect(h.grid.showCell).toHaveBeenLastCalledWith(10, 1);
    act(() => void h.store.undo());
    expect(h.store.getCell(1, 1)).toBe('v1');
    expect(h.store.canUndo()).toBe(false);
  });

  it('replaces only the matching part of the text, in plain mode', () => {
    const h = setup();
    h.search('v1');
    replaceWith(h, 'q');
    replace(h);
    replace(h);
    expect(h.store.getCell(1, 1)).toBe('q');
    expect(h.store.getCell(10, 1)).toBe('q0');
  });

  it('takes a dollar sign in the replacement literally in plain mode and as a group in regex mode', () => {
    const plain = setup();
    plain.search('v1');
    replaceWith(plain, '$&$&');
    replace(plain);
    expect(plain.store.getCell(1, 1)).toBe('$&$&');

    const regex = setup();
    regex.open();
    regex.toggle('regex');
    regex.type('v(1)');
    regex.settle();
    replaceWith(regex, '[$1]');
    replace(regex);
    expect(regex.store.getCell(1, 1)).toBe('[1]');
  });

  it('moves on even when the replaced cell still matches, instead of picking it again', () => {
    const h = setup();
    h.search('v');
    replaceWith(h, 'vv');
    replace(h);
    expect(h.store.getCell(0, 1)).toBe('vv0');
    expect(h.find().highlight?.current).toEqual({ row: 1, col: 1 });
    replace(h);
    expect(h.store.getCell(1, 1)).toBe('vv1');
    expect(h.find().highlight?.current).toEqual({ row: 2, col: 1 });
  });

  it('wraps to the first match after replacing the last one', () => {
    const h = setup({ rows: 3 });
    h.search('v');
    replaceWith(h, 'v');
    act(() => h.find().bar.onStep(-1));
    expect(h.find().highlight?.current).toEqual({ row: 2, col: 1 });
    replaceWith(h, 'vv');
    replace(h);
    expect(h.store.getCell(2, 1)).toBe('vv2');
    expect(h.find().highlight?.current).toEqual({ row: 0, col: 1 });
  });

  it('replacing every match one by one ends with no matches and an empty highlight', () => {
    const h = setup({ rows: 3 });
    h.search('v');
    replaceWith(h, 'X');
    replace(h);
    replace(h);
    replace(h);
    expect(h.find().bar.status).toBe('No matches');
    expect(h.find().highlight).toBeUndefined();
    expect(h.store.getCell(0, 1)).toBe('X0');
    replace(h);
    expect(h.store.undoLabel()).toBe('Replace');
  });

  it('a replacement that changes nothing makes no step but still moves on', () => {
    const h = setup();
    h.search('v1');
    replaceWith(h, 'v1');
    replace(h);
    expect(h.store.canUndo()).toBe(false);
    expect(h.find().highlight?.current).toEqual({ row: 10, col: 1 });
  });

  it('commits an open cell editor first, then searches again so the match is really there', () => {
    const h = setup();
    h.search('v1');
    h.grid.commitEdit.mockImplementation(() => {
      // The editor commits text that removes the first match.
      h.store.setCell(1, 1, 'edited');
    });
    replaceWith(h, 'X');
    replace(h);
    expect(h.grid.commitEdit).toHaveBeenCalledTimes(1);
    // The edit took v1 away, so the current position (0) is now v10, which is the one replaced.
    expect(h.store.getCell(10, 1)).toBe('X0');
    expect(h.store.getCell(1, 1)).toBe('edited');
  });

  it('is one store notification for the change, and the matches are fresh at once, without waiting', () => {
    const h = setup();
    h.search('v1');
    const notified = vi.fn();
    h.store.subscribe(notified);
    replaceWith(h, 'X');
    replace(h);
    expect(notified).toHaveBeenCalledTimes(1);
    expect(h.find().bar.status).toBe('1 of 2');
  });

  it('does nothing without matches or without a query', () => {
    const h = setup();
    h.open();
    replace(h);
    h.type('nope');
    h.settle();
    replace(h);
    expect(h.store.canUndo()).toBe(false);
    expect(h.onBlocked).not.toHaveBeenCalled();
  });

  it('refuses a table that cannot be edited and says why through onBlocked', () => {
    const h = setup({ overridden: false });
    h.search('v1');
    expect(h.find().bar.canReplace).toBe(false);
    expect(h.find().bar.hasMatches).toBe(true);
    replaceWith(h, 'X');
    replace(h);
    expect(h.onBlocked).toHaveBeenCalledTimes(1);
    expect(h.store.getCell(1, 1)).toBe('v1');
    expect(h.store.canUndo()).toBe(false);
  });

  it('becomes available when the table is overridden', () => {
    const h = setup({ overridden: false });
    h.search('v1');
    expect(h.find().bar.canReplace).toBe(false);
    act(() => h.store.override());
    h.hook.rerender({ s: h.store });
    expect(h.find().bar.canReplace).toBe(true);
  });
});

describe('useCrtFind: Replace all', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const replaceWith = (h: ReturnType<typeof setup>, text: string) => act(() => h.find().bar.onReplacementChange(text));
  const replaceAll = (h: ReturnType<typeof setup>) => act(() => h.find().bar.onReplaceAll());

  it('replaces every match as one undo step labelled Replace all, and says how many cells', () => {
    const h = setup();
    h.search('v1');
    replaceWith(h, 'X');
    replaceAll(h);
    expect(h.store.getCell(1, 1)).toBe('X');
    expect(h.store.getCell(10, 1)).toBe('X0');
    expect(h.store.getCell(11, 1)).toBe('X1');
    expect(h.store.getCell(2, 1)).toBe('v2');
    expect(h.store.undoLabel()).toBe('Replace all');
    expect(h.onNotice).toHaveBeenCalledWith('Replaced 3 cells', 'info');
    act(() => void h.store.undo());
    expect(h.store.getCell(1, 1)).toBe('v1');
    expect(h.store.getCell(10, 1)).toBe('v10');
    expect(h.store.getCell(11, 1)).toBe('v11');
    expect(h.store.canUndo()).toBe(false);
  });

  it('is one store notification however many cells change, and the matches are fresh at once', () => {
    const h = setup();
    h.search('v');
    const notified = vi.fn();
    h.store.subscribe(notified);
    replaceWith(h, 'X');
    replaceAll(h);
    expect(notified).toHaveBeenCalledTimes(1);
    expect(h.find().bar.status).toBe('No matches');
    expect(h.find().highlight).toBeUndefined();
    expect(h.onNotice).toHaveBeenCalledWith('Replaced 12 cells', 'info');
  });

  it('uses the singular for one cell', () => {
    const h = setup();
    h.search('v11');
    replaceWith(h, 'X');
    replaceAll(h);
    expect(h.onNotice).toHaveBeenCalledWith('Replaced 1 cell', 'info');
  });

  it('follows the search options, the same cells that were highlighted', () => {
    const store = createCrtStore({
      ...makeTable(0),
      overrideRows: [['Apple', 'apple pie'], ['apple', 'APPLE']],
      columns: ['A', 'B'],
    });
    const h = setup({ store });
    h.open();
    h.toggle('matchCase');
    h.toggle('wholeCell');
    h.type('apple');
    h.settle();
    expect(h.find().bar.status).toBe('1 of 1');
    replaceWith(h, 'orange');
    replaceAll(h);
    expect(snapshot(store)).toEqual([['Apple', 'apple pie'], ['orange', 'APPLE']]);
  });

  it('a regex replacement can use groups', () => {
    const h = setup({ rows: 2 });
    h.open();
    h.toggle('regex');
    h.type('^k(\\d)$');
    h.settle();
    replaceWith(h, 'key-$1');
    replaceAll(h);
    expect(h.store.getCell(0, 0)).toBe('key-0');
    expect(h.store.getCell(1, 0)).toBe('key-1');
  });

  it('warns when the plan was cut, saying the first cells were replaced and to run it again', () => {
    const rows = Array.from({ length: 2600 }, () => Array.from({ length: 20 }, () => 'x'));
    const big = createCrtStore({ ...makeTable(0, true, 20), overrideRows: rows });
    const h = setup({ store: big });
    h.search('x');
    replaceWith(h, 'y');
    replaceAll(h);
    expect(h.onNotice).toHaveBeenCalledTimes(1);
    const [message, kind] = h.onNotice.mock.calls[0];
    expect(kind).toBe('warn');
    expect(message).toContain('first 50,000 cells');
    expect(message).toContain('run Replace all again');
    // 52,000 cells matched, 50,000 changed, 2,000 are left for the second run.
    expect(h.find().bar.status).toBe('1 of 2,000');
    expect(big.undoLabel()).toBe('Replace all');
    replaceAll(h);
    expect(h.onNotice).toHaveBeenLastCalledWith('Replaced 2,000 cells', 'info');
    expect(h.find().bar.status).toBe('No matches');
  });

  it('says there was nothing to replace when no cell would change, and adds no step', () => {
    const h = setup();
    h.search('v1');
    replaceWith(h, 'v1');
    replaceAll(h);
    expect(h.onNotice).toHaveBeenCalledWith('Nothing to replace', 'info');
    expect(h.store.canUndo()).toBe(false);
  });

  it('commits an open cell editor first', () => {
    const h = setup();
    h.search('v1');
    replaceWith(h, 'X');
    replaceAll(h);
    expect(h.grid.commitEdit).toHaveBeenCalledTimes(1);
  });

  it('refuses a table that cannot be edited, with no notice and no change', () => {
    const h = setup({ overridden: false });
    h.search('v1');
    replaceWith(h, 'X');
    replaceAll(h);
    expect(h.onBlocked).toHaveBeenCalledTimes(1);
    expect(h.onNotice).not.toHaveBeenCalled();
    expect(h.store.getCell(1, 1)).toBe('v1');
  });

  it('does nothing for an invalid pattern', () => {
    const h = setup();
    h.open();
    h.toggle('regex');
    h.type('(');
    h.settle();
    replaceWith(h, 'X');
    replaceAll(h);
    expect(h.onNotice).not.toHaveBeenCalled();
    expect(h.store.canUndo()).toBe(false);
    expect(h.find().bar.status).toBe('Invalid regular expression');
  });

  it('is quick on a full table', () => {
    const rows = Array.from({ length: 10000 }, (_, r) => Array.from({ length: 20 }, (_, c) => (c === 3 ? 'target' : `r${r}c${c}`)));
    const big = createCrtStore({ ...makeTable(0, true, 20), overrideRows: rows });
    const h = setup({ store: big });
    h.search('target');
    expect(h.find().bar.status).toBe('1 of 10,000');
    replaceWith(h, 'done');
    const start = performance.now();
    replaceAll(h);
    expect(performance.now() - start).toBeLessThan(1500);
    expect(h.onNotice).toHaveBeenCalledWith('Replaced 10,000 cells', 'info');
    expect(big.getCell(9999, 3)).toBe('done');
  });
});

function snapshot(store: CrtStore): string[][] {
  return Array.from({ length: store.rowCount() }, (_, r) =>
    Array.from({ length: store.colCount() }, (_, c) => store.getCell(r, c))
  );
}
