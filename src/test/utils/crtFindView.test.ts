/**
 * @file crtFindView.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The pure rules behind the find and replace row: the debounce, the row to column masks the grid
 * rows are handed, the counter text, which match becomes current, the Replace all notice and
 * the find keys.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRowMasks,
  CRT_FIND_DEBOUNCE_MS,
  debounce,
  describeReplaceAll,
  findStatusText,
  keepCurrentIndex,
  matchAfter,
  MAX_MASK_COLS,
  maskHasCol,
  resolveFindKey,
  SEARCH_STOPPED_EARLY_TEXT,
} from '../../utils/crt/crtFindView';
import type { CrtMatch } from '../../utils/crt/crtSearch';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is 200 ms by default for the find row', () => {
    expect(CRT_FIND_DEBOUNCE_MS).toBe(200);
  });

  it('runs once, after the calls stop', () => {
    const fn = vi.fn();
    const call = debounce(fn, 200);
    call();
    vi.advanceTimersByTime(150);
    call();
    vi.advanceTimersByTime(150);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs again for a later burst of calls', () => {
    const fn = vi.fn();
    const call = debounce(fn, 100);
    call();
    vi.advanceTimersByTime(100);
    call();
    call();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('flush runs a waiting call now and leaves nothing behind', () => {
    const fn = vi.fn();
    const call = debounce(fn, 200);
    call();
    call.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush does nothing when no call is waiting', () => {
    const fn = vi.fn();
    const call = debounce(fn, 200);
    call.flush();
    expect(fn).not.toHaveBeenCalled();
    call();
    vi.advanceTimersByTime(200);
    call.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel drops a waiting call, and a new call after it still works', () => {
    const fn = vi.fn();
    const call = debounce(fn, 200);
    call();
    call.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
    call.cancel();
    call();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a call made by the function itself while it runs is scheduled normally', () => {
    let runs = 0;
    const call: ReturnType<typeof debounce> = debounce(() => {
      runs += 1;
      if (runs === 1) call();
    }, 100);
    call();
    vi.advanceTimersByTime(100);
    expect(runs).toBe(1);
    vi.advanceTimersByTime(100);
    expect(runs).toBe(2);
  });
});

describe('buildRowMasks', () => {
  const m = (row: number, col: number): CrtMatch => ({ row, col });

  it('is empty without matches', () => {
    expect(buildRowMasks([]).size).toBe(0);
  });

  it('sets one bit per matching column, one number per row', () => {
    const masks = buildRowMasks([m(0, 0), m(0, 2), m(3, 1), m(7, 19)]);
    expect(masks.size).toBe(3);
    expect(masks.get(0)).toBe(0b101);
    expect(masks.get(3)).toBe(0b10);
    expect(masks.get(7)).toBe(1 << 19);
    expect(masks.get(1)).toBeUndefined();
  });

  it('fits the 20 columns of a table in the mask', () => {
    const all = Array.from({ length: 20 }, (_, c) => m(5, c));
    const mask = buildRowMasks(all).get(5) as number;
    for (let c = 0; c < 20; c++) expect(maskHasCol(mask, c)).toBe(true);
    expect(maskHasCol(mask, 20)).toBe(false);
  });

  it('ignores a column the mask cannot hold, and a negative one', () => {
    expect(MAX_MASK_COLS).toBe(31);
    const masks = buildRowMasks([m(0, 31), m(0, 40), m(1, -1), m(2, 30)]);
    expect(masks.has(0)).toBe(false);
    expect(masks.has(1)).toBe(false);
    expect(masks.get(2)).toBe(1 << 30);
    expect(masks.get(2)).toBeGreaterThan(0);
  });

  it('handles 50,000 matches quickly', () => {
    const matches: CrtMatch[] = [];
    for (let r = 0; r < 10000; r++) for (let c = 0; c < 5; c++) matches.push(m(r, c));
    const start = performance.now();
    const masks = buildRowMasks(matches);
    expect(performance.now() - start).toBeLessThan(500);
    expect(masks.size).toBe(10000);
    expect(masks.get(9999)).toBe(0b11111);
  });
});

describe('maskHasCol', () => {
  it('reads the bit of the column', () => {
    expect(maskHasCol(0b1010, 1)).toBe(true);
    expect(maskHasCol(0b1010, 3)).toBe(true);
    expect(maskHasCol(0b1010, 0)).toBe(false);
    expect(maskHasCol(0b1010, 2)).toBe(false);
  });

  it('is false for a zero mask, whatever the column', () => {
    expect(maskHasCol(0, 0)).toBe(false);
    expect(maskHasCol(0, 19)).toBe(false);
  });

  it('is false for a column outside the mask', () => {
    expect(maskHasCol(-1, 31)).toBe(false);
    expect(maskHasCol(0xffffffff, -1)).toBe(false);
  });
});

describe('findStatusText', () => {
  const base = { query: 'a', error: null, count: 0, current: -1, truncated: false };

  it('is empty with no query', () => {
    expect(findStatusText({ ...base, query: '' })).toBe('');
    expect(findStatusText({ ...base, query: '', count: 5, current: 2 })).toBe('');
  });

  it('says No matches for zero matches', () => {
    expect(findStatusText(base)).toBe('No matches');
  });

  it('shows the position and the total', () => {
    expect(findStatusText({ ...base, count: 12, current: 2 })).toBe('3 of 12');
    expect(findStatusText({ ...base, count: 1, current: 0 })).toBe('1 of 1');
  });

  it('uses a thousands separator', () => {
    expect(findStatusText({ ...base, count: 12345, current: 1233 })).toBe('1,234 of 12,345');
  });

  it('adds a plus and the word matches when the search stopped at its limit', () => {
    expect(findStatusText({ ...base, count: 50000, current: 2, truncated: true })).toBe('3 of 50,000+ matches');
    expect(findStatusText({ ...base, count: 50000, current: -1, truncated: true })).toBe('50,000+ matches');
  });

  it('shows the total alone when there is no valid current match', () => {
    expect(findStatusText({ ...base, count: 4, current: -1 })).toBe('4');
    expect(findStatusText({ ...base, count: 4, current: 9 })).toBe('4');
  });

  it('shows the error of an invalid pattern, ahead of everything else', () => {
    expect(findStatusText({ ...base, error: 'Invalid regular expression' })).toBe('Invalid regular expression');
    expect(findStatusText({ ...base, query: '', error: 'Invalid regular expression' })).toBe('');
  });

  it('shows the error of a pattern refused as too slow', () => {
    const slow = 'This pattern could take too long to run. Try a simpler one.';
    expect(findStatusText({ ...base, error: slow })).toBe(slow);
  });

  it('says the search stopped early, with or without matches found so far', () => {
    expect(SEARCH_STOPPED_EARLY_TEXT).toBe('Search stopped early, the table is large or the pattern is slow');
    expect(findStatusText({ ...base, stoppedEarly: true })).toBe(SEARCH_STOPPED_EARLY_TEXT);
    expect(findStatusText({ ...base, count: 7, current: 2, stoppedEarly: true })).toBe(SEARCH_STOPPED_EARLY_TEXT);
    expect(findStatusText({ ...base, count: 7, current: 2, stoppedEarly: false })).toBe('3 of 7');
  });

  it('puts an error ahead of stopped early, and an empty query ahead of both', () => {
    expect(findStatusText({ ...base, error: 'Invalid regular expression', stoppedEarly: true })).toBe('Invalid regular expression');
    expect(findStatusText({ ...base, query: '', stoppedEarly: true })).toBe('');
  });
});

describe('keepCurrentIndex', () => {
  it('keeps a position that is still in the list', () => {
    expect(keepCurrentIndex(0, 5)).toBe(0);
    expect(keepCurrentIndex(3, 5)).toBe(3);
    expect(keepCurrentIndex(4, 5)).toBe(4);
  });

  it('clamps a position past the end to the last match', () => {
    expect(keepCurrentIndex(7, 5)).toBe(4);
    expect(keepCurrentIndex(5, 5)).toBe(4);
  });

  it('starts at the first match when there was no current match', () => {
    expect(keepCurrentIndex(-1, 3)).toBe(0);
  });

  it('is -1 when nothing matches', () => {
    expect(keepCurrentIndex(2, 0)).toBe(-1);
    expect(keepCurrentIndex(-1, 0)).toBe(-1);
  });
});

describe('matchAfter', () => {
  const matches: CrtMatch[] = [
    { row: 0, col: 1 },
    { row: 0, col: 3 },
    { row: 2, col: 0 },
    { row: 5, col: 2 },
  ];

  it('is the next match in the same row', () => {
    expect(matchAfter(matches, 0, 1)).toBe(1);
  });

  it('skips the cell itself, which may still match after a replace', () => {
    expect(matchAfter(matches, 2, 0)).toBe(3);
  });

  it('moves to a later row from the last match of a row', () => {
    expect(matchAfter(matches, 0, 3)).toBe(2);
  });

  it('works from a cell that is not a match', () => {
    expect(matchAfter(matches, 1, 9)).toBe(2);
    expect(matchAfter(matches, 3, 0)).toBe(3);
  });

  it('wraps to the first match after the last one', () => {
    expect(matchAfter(matches, 5, 2)).toBe(0);
    expect(matchAfter(matches, 9, 0)).toBe(0);
  });

  it('is -1 without matches', () => {
    expect(matchAfter([], 0, 0)).toBe(-1);
  });

  it('works from the last column of a table, where col + 1 is past the row', () => {
    const rows: CrtMatch[] = [
      { row: 1, col: 3 },
      { row: 2, col: 0 },
    ];
    expect(matchAfter(rows, 1, 3)).toBe(1);
  });
});

describe('describeReplaceAll', () => {
  it('says how many cells were replaced, with a thousands separator', () => {
    expect(describeReplaceAll(12, false)).toEqual({ message: 'Replaced 12 cells', kind: 'info' });
    expect(describeReplaceAll(12345, false)).toEqual({ message: 'Replaced 12,345 cells', kind: 'info' });
  });

  it('uses the singular for one cell', () => {
    expect(describeReplaceAll(1, false)).toEqual({ message: 'Replaced 1 cell', kind: 'info' });
  });

  it('warns when the plan was cut, naming how many were done and to run it again', () => {
    const notice = describeReplaceAll(50000, true);
    expect(notice.kind).toBe('warn');
    expect(notice.message).toContain('first 50,000 cells');
    expect(notice.message).toContain('run Replace all again');
  });

  it('says there was nothing to replace when no cell would change', () => {
    expect(describeReplaceAll(0, false)).toEqual({ message: 'Nothing to replace', kind: 'info' });
  });
});

describe('resolveFindKey', () => {
  it.each([
    ['Ctrl+F', { key: 'f', ctrlKey: true }],
    ['Cmd+F', { key: 'f', metaKey: true }],
    ['Ctrl+F with Caps Lock', { key: 'F', ctrlKey: true }],
  ])('%s opens find', (_name, k) => {
    expect(resolveFindKey(k)).toBe('open');
  });

  it('F3 steps forward and Shift+F3 steps back', () => {
    expect(resolveFindKey({ key: 'F3' })).toBe('next');
    expect(resolveFindKey({ key: 'F3', shiftKey: true })).toBe('prev');
  });

  it.each([
    ['plain f', { key: 'f' }],
    ['Shift+F', { key: 'F', shiftKey: true }],
    ['Ctrl+Shift+F', { key: 'F', ctrlKey: true, shiftKey: true }],
    ['Ctrl+Alt+F (AltGr)', { key: 'f', ctrlKey: true, altKey: true }],
    ['Alt+F3', { key: 'F3', altKey: true }],
    ['Ctrl+F3', { key: 'F3', ctrlKey: true }],
    ['Cmd+F3', { key: 'F3', metaKey: true }],
    ['Ctrl+G', { key: 'g', ctrlKey: true }],
    ['F4', { key: 'F4' }],
    ['Enter', { key: 'Enter' }],
  ])('leaves %s alone', (_name, k) => {
    expect(resolveFindKey(k)).toBeNull();
  });
});
