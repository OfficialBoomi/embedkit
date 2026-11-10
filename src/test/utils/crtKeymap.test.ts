/**
 * @file crtKeymap.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  isPrintableKey,
  resolveNavKey,
  resolveEditKey,
  type KeyInput,
  type NavContext,
  type NavAction,
} from '../../utils/crt/crtKeymap';

/** A 20 x 10 grid with the active cell in the middle, editable. */
const ctx = (over: Partial<NavContext> = {}): NavContext => ({
  row: 5,
  col: 3,
  rowCount: 20,
  colCount: 10,
  pageRows: 10,
  editable: true,
  ...over,
});

const mv = (row: number, col: number, extend = false): NavAction => ({
  type: 'move',
  row,
  col,
  extend,
});

const key = (name: string, mods: Omit<KeyInput, 'key'> = {}): KeyInput => ({ key: name, ...mods });

const BLOCKED: NavAction = { type: 'blocked' };

describe('isPrintableKey', () => {
  it.each(['a', 'z', 'A', 'Z', 'q'])('accepts the letter %s', (k) => {
    expect(isPrintableKey(k)).toBe(true);
  });

  it.each(['0', '5', '9'])('accepts the digit %s', (k) => {
    expect(isPrintableKey(k)).toBe(true);
  });

  it.each(['!', '@', '#', '$', '%', '*', '-', '_', '+', '=', '/', '\\', '.', ',', ';', "'", '"', '~', '`'])(
    'accepts the symbol %s',
    (k) => {
      expect(isPrintableKey(k)).toBe(true);
    },
  );

  it('accepts the space', () => {
    expect(isPrintableKey(' ')).toBe(true);
  });

  it('accepts a single non-ASCII character', () => {
    expect(isPrintableKey('\u00e9')).toBe(true);
    expect(isPrintableKey('\u00fc')).toBe(true);
    expect(isPrintableKey('\u20ac')).toBe(true);
    expect(isPrintableKey('\u4e2d')).toBe(true);
  });

  it('accepts an emoji that is one code point even though it is two UTF-16 units', () => {
    const emoji = '\u{1F600}';
    expect(emoji.length).toBe(2);
    expect(isPrintableKey(emoji)).toBe(true);
  });

  it('rejects text that is more than one code point', () => {
    expect(isPrintableKey('ab')).toBe(false);
    expect(isPrintableKey('e\u0301')).toBe(false); // e + combining accent
    expect(isPrintableKey('\u{1F44D}\u{1F3FD}')).toBe(false); // emoji + skin tone
    expect(isPrintableKey('\u{1F468}\u200d\u{1F469}\u200d\u{1F467}')).toBe(false); // joined sequence
  });

  it.each([
    'Enter',
    'Tab',
    'ArrowUp',
    'ArrowDown',
    'Escape',
    'Backspace',
    'Delete',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'F2',
    'Shift',
    'Control',
    'Meta',
    'Alt',
    'Dead',
    'Unidentified',
  ])('rejects the key name %s', (k) => {
    expect(isPrintableKey(k)).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(isPrintableKey('')).toBe(false);
  });

  it.each([
    ['NUL', '\u0000'],
    ['TAB char', '\t'],
    ['line feed', '\n'],
    ['carriage return', '\r'],
    ['escape char', '\u001b'],
    ['unit separator', '\u001f'],
    ['DEL', '\u007f'],
    ['C1 control', '\u0085'],
    ['last C1 control', '\u009f'],
  ])('rejects the control character %s', (_name, k) => {
    expect(isPrintableKey(k)).toBe(false);
  });

  it('accepts the characters on either side of the control ranges', () => {
    expect(isPrintableKey(' ')).toBe(true);
    expect(isPrintableKey('~')).toBe(true);
    expect(isPrintableKey('\u00a0')).toBe(true);
  });
});

describe('resolveNavKey: guards', () => {
  it.each([
    ['no rows', { rowCount: 0 }],
    ['no columns', { colCount: 0 }],
    ['no rows and no columns', { rowCount: 0, colCount: 0 }],
    ['negative row count', { rowCount: -1 }],
    ['negative column count', { colCount: -3 }],
  ])('returns null for every key when the grid has %s', (_name, over) => {
    const c = ctx(over);
    for (const name of ['ArrowDown', 'ArrowRight', 'Home', 'End', 'PageDown', 'Tab', 'Enter', 'F2', 'Delete', 'Backspace', 'a', ' ']) {
      expect(resolveNavKey(key(name), c)).toBeNull();
    }
  });

  it.each([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'Tab',
    'Enter',
    'F2',
    'Delete',
    'Backspace',
    'a',
    '7',
    ' ',
  ])('returns null for %s when alt is held', (name) => {
    // Plain Alt is a shortcut key everywhere but on a Mac, where Option types characters (below).
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    expect(resolveNavKey(key(name, { altKey: true }), ctx())).toBeNull();
    vi.restoreAllMocks();
  });

  it('returns null for alt combined with other modifiers', () => {
    expect(resolveNavKey(key('ArrowDown', { altKey: true, shiftKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key('ArrowDown', { altKey: true, ctrlKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key('a', { altKey: true, metaKey: true }), ctx())).toBeNull();
  });

  it('does not mutate the context it is given', () => {
    const c = ctx();
    const copy = { ...c };
    resolveNavKey(key('ArrowDown'), c);
    resolveNavKey(key('Tab'), c);
    expect(c).toEqual(copy);
  });
});

describe('resolveNavKey: arrow keys', () => {
  it('moves one cell in each direction', () => {
    const c = ctx();
    expect(resolveNavKey(key('ArrowUp'), c)).toEqual(mv(4, 3));
    expect(resolveNavKey(key('ArrowDown'), c)).toEqual(mv(6, 3));
    expect(resolveNavKey(key('ArrowLeft'), c)).toEqual(mv(5, 2));
    expect(resolveNavKey(key('ArrowRight'), c)).toEqual(mv(5, 4));
  });

  it('sets extend from the shift key', () => {
    const c = ctx();
    expect(resolveNavKey(key('ArrowUp', { shiftKey: true }), c)).toEqual(mv(4, 3, true));
    expect(resolveNavKey(key('ArrowDown', { shiftKey: true }), c)).toEqual(mv(6, 3, true));
    expect(resolveNavKey(key('ArrowLeft', { shiftKey: true }), c)).toEqual(mv(5, 2, true));
    expect(resolveNavKey(key('ArrowRight', { shiftKey: true }), c)).toEqual(mv(5, 4, true));
  });

  it('clamps at the top edge and still returns a move', () => {
    expect(resolveNavKey(key('ArrowUp'), ctx({ row: 0 }))).toEqual(mv(0, 3));
    expect(resolveNavKey(key('ArrowUp', { shiftKey: true }), ctx({ row: 0 }))).toEqual(mv(0, 3, true));
  });

  it('clamps at the bottom edge and still returns a move', () => {
    expect(resolveNavKey(key('ArrowDown'), ctx({ row: 19 }))).toEqual(mv(19, 3));
    expect(resolveNavKey(key('ArrowDown', { shiftKey: true }), ctx({ row: 19 }))).toEqual(mv(19, 3, true));
  });

  it('clamps at the left edge and still returns a move', () => {
    expect(resolveNavKey(key('ArrowLeft'), ctx({ col: 0 }))).toEqual(mv(5, 0));
    expect(resolveNavKey(key('ArrowLeft', { shiftKey: true }), ctx({ col: 0 }))).toEqual(mv(5, 0, true));
  });

  it('clamps at the right edge and still returns a move', () => {
    expect(resolveNavKey(key('ArrowRight'), ctx({ col: 9 }))).toEqual(mv(5, 9));
    expect(resolveNavKey(key('ArrowRight', { shiftKey: true }), ctx({ col: 9 }))).toEqual(mv(5, 9, true));
  });

  it('clamps in a corner on both axes independently', () => {
    expect(resolveNavKey(key('ArrowUp'), ctx({ row: 0, col: 0 }))).toEqual(mv(0, 0));
    expect(resolveNavKey(key('ArrowLeft'), ctx({ row: 0, col: 0 }))).toEqual(mv(0, 0));
    expect(resolveNavKey(key('ArrowDown'), ctx({ row: 19, col: 9 }))).toEqual(mv(19, 9));
    expect(resolveNavKey(key('ArrowRight'), ctx({ row: 19, col: 9 }))).toEqual(mv(19, 9));
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['ctrl and meta', { ctrlKey: true, metaKey: true }],
  ])('jumps to the edge in the arrow direction with %s', (_name, mod) => {
    const c = ctx();
    expect(resolveNavKey(key('ArrowUp', mod), c)).toEqual(mv(0, 3));
    expect(resolveNavKey(key('ArrowDown', mod), c)).toEqual(mv(19, 3));
    expect(resolveNavKey(key('ArrowLeft', mod), c)).toEqual(mv(5, 0));
    expect(resolveNavKey(key('ArrowRight', mod), c)).toEqual(mv(5, 9));
  });

  it('extends while jumping when shift is also held', () => {
    const c = ctx();
    expect(resolveNavKey(key('ArrowUp', { ctrlKey: true, shiftKey: true }), c)).toEqual(mv(0, 3, true));
    expect(resolveNavKey(key('ArrowDown', { metaKey: true, shiftKey: true }), c)).toEqual(mv(19, 3, true));
    expect(resolveNavKey(key('ArrowLeft', { ctrlKey: true, shiftKey: true }), c)).toEqual(mv(5, 0, true));
    expect(resolveNavKey(key('ArrowRight', { metaKey: true, shiftKey: true }), c)).toEqual(mv(5, 9, true));
  });

  it('still returns a move when a jump lands on the same cell', () => {
    expect(resolveNavKey(key('ArrowUp', { ctrlKey: true }), ctx({ row: 0 }))).toEqual(mv(0, 3));
    expect(resolveNavKey(key('ArrowDown', { ctrlKey: true }), ctx({ row: 19 }))).toEqual(mv(19, 3));
    expect(resolveNavKey(key('ArrowLeft', { ctrlKey: true }), ctx({ col: 0 }))).toEqual(mv(5, 0));
    expect(resolveNavKey(key('ArrowRight', { ctrlKey: true }), ctx({ col: 9 }))).toEqual(mv(5, 9));
  });

  it('is the same whether or not the grid is editable', () => {
    expect(resolveNavKey(key('ArrowDown'), ctx({ editable: false }))).toEqual(mv(6, 3));
    expect(resolveNavKey(key('ArrowRight', { ctrlKey: true }), ctx({ editable: false }))).toEqual(mv(5, 9));
  });
});

describe('resolveNavKey: Home and End', () => {
  it('Home goes to column 0 of the same row', () => {
    expect(resolveNavKey(key('Home'), ctx())).toEqual(mv(5, 0));
  });

  it('End goes to the last column of the same row', () => {
    expect(resolveNavKey(key('End'), ctx())).toEqual(mv(5, 9));
  });

  it('Home and End return a move even when already there', () => {
    expect(resolveNavKey(key('Home'), ctx({ col: 0 }))).toEqual(mv(5, 0));
    expect(resolveNavKey(key('End'), ctx({ col: 9 }))).toEqual(mv(5, 9));
  });

  it('ctrl and meta + Home go to the first cell', () => {
    expect(resolveNavKey(key('Home', { ctrlKey: true }), ctx())).toEqual(mv(0, 0));
    expect(resolveNavKey(key('Home', { metaKey: true }), ctx())).toEqual(mv(0, 0));
  });

  it('ctrl and meta + End go to the last cell', () => {
    expect(resolveNavKey(key('End', { ctrlKey: true }), ctx())).toEqual(mv(19, 9));
    expect(resolveNavKey(key('End', { metaKey: true }), ctx())).toEqual(mv(19, 9));
  });

  it('sets extend from the shift key on every variant', () => {
    expect(resolveNavKey(key('Home', { shiftKey: true }), ctx())).toEqual(mv(5, 0, true));
    expect(resolveNavKey(key('End', { shiftKey: true }), ctx())).toEqual(mv(5, 9, true));
    expect(resolveNavKey(key('Home', { ctrlKey: true, shiftKey: true }), ctx())).toEqual(mv(0, 0, true));
    expect(resolveNavKey(key('End', { metaKey: true, shiftKey: true }), ctx())).toEqual(mv(19, 9, true));
  });

  it('leaves extend false when shift is not held', () => {
    expect(resolveNavKey(key('Home', { ctrlKey: true }), ctx())).toEqual(mv(0, 0, false));
    expect(resolveNavKey(key('End', { ctrlKey: true }), ctx())).toEqual(mv(19, 9, false));
  });
});

describe('resolveNavKey: PageDown and PageUp', () => {
  it('moves by pageRows and keeps the column', () => {
    expect(resolveNavKey(key('PageDown'), ctx({ row: 2, pageRows: 10 }))).toEqual(mv(12, 3));
    expect(resolveNavKey(key('PageUp'), ctx({ row: 15, pageRows: 10 }))).toEqual(mv(5, 3));
  });

  it('moves one row when pageRows is 1', () => {
    expect(resolveNavKey(key('PageDown'), ctx({ pageRows: 1 }))).toEqual(mv(6, 3));
    expect(resolveNavKey(key('PageUp'), ctx({ pageRows: 1 }))).toEqual(mv(4, 3));
  });

  it('moves at least one row when pageRows is 0', () => {
    expect(resolveNavKey(key('PageDown'), ctx({ pageRows: 0 }))).toEqual(mv(6, 3));
    expect(resolveNavKey(key('PageUp'), ctx({ pageRows: 0 }))).toEqual(mv(4, 3));
  });

  it('moves at least one row when pageRows is negative', () => {
    expect(resolveNavKey(key('PageDown'), ctx({ pageRows: -4 }))).toEqual(mv(6, 3));
    expect(resolveNavKey(key('PageUp'), ctx({ pageRows: -4 }))).toEqual(mv(4, 3));
  });

  it('always lands on a whole row', () => {
    expect(resolveNavKey(key('PageDown'), ctx({ pageRows: 2.7 }))).toEqual(mv(7, 3));
    expect(resolveNavKey(key('PageDown'), ctx({ pageRows: Number.NaN }))).toEqual(mv(6, 3));
    expect(resolveNavKey(key('PageUp'), ctx({ pageRows: Number.NaN }))).toEqual(mv(4, 3));
  });

  it('clamps to the last row going down', () => {
    expect(resolveNavKey(key('PageDown'), ctx({ row: 15, pageRows: 10 }))).toEqual(mv(19, 3));
    expect(resolveNavKey(key('PageDown'), ctx({ row: 19, pageRows: 10 }))).toEqual(mv(19, 3));
  });

  it('clamps to the first row going up', () => {
    expect(resolveNavKey(key('PageUp'), ctx({ row: 4, pageRows: 10 }))).toEqual(mv(0, 3));
    expect(resolveNavKey(key('PageUp'), ctx({ row: 0, pageRows: 10 }))).toEqual(mv(0, 3));
  });

  it('clamps with a page larger than the whole grid', () => {
    expect(resolveNavKey(key('PageDown'), ctx({ pageRows: 500 }))).toEqual(mv(19, 3));
    expect(resolveNavKey(key('PageUp'), ctx({ pageRows: 500 }))).toEqual(mv(0, 3));
  });

  it('sets extend from the shift key', () => {
    expect(resolveNavKey(key('PageDown', { shiftKey: true }), ctx({ row: 2 }))).toEqual(mv(12, 3, true));
    expect(resolveNavKey(key('PageUp', { shiftKey: true }), ctx({ row: 15 }))).toEqual(mv(5, 3, true));
    expect(resolveNavKey(key('PageDown'), ctx({ row: 2 }))).toEqual(mv(12, 3, false));
  });

  it('returns null with ctrl or meta', () => {
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { ctrlKey: true, shiftKey: true }]) {
      expect(resolveNavKey(key('PageDown', mod), ctx())).toBeNull();
      expect(resolveNavKey(key('PageUp', mod), ctx())).toBeNull();
    }
  });
});

describe('resolveNavKey: Tab', () => {
  it('moves one column right', () => {
    expect(resolveNavKey(key('Tab'), ctx())).toEqual(mv(5, 4));
    expect(resolveNavKey(key('Tab'), ctx({ row: 0, col: 0 }))).toEqual(mv(0, 1));
  });

  it('wraps from the last column to column 0 of the next row', () => {
    expect(resolveNavKey(key('Tab'), ctx({ row: 5, col: 9 }))).toEqual(mv(6, 0));
    expect(resolveNavKey(key('Tab'), ctx({ row: 0, col: 9 }))).toEqual(mv(1, 0));
    expect(resolveNavKey(key('Tab'), ctx({ row: 18, col: 9 }))).toEqual(mv(19, 0));
  });

  it('returns null at the very last cell so focus can leave the grid', () => {
    expect(resolveNavKey(key('Tab'), ctx({ row: 19, col: 9 }))).toBeNull();
  });

  it('does not return null on the last row before the last column', () => {
    expect(resolveNavKey(key('Tab'), ctx({ row: 19, col: 8 }))).toEqual(mv(19, 9));
  });

  it('Shift+Tab moves one column left', () => {
    expect(resolveNavKey(key('Tab', { shiftKey: true }), ctx())).toEqual(mv(5, 2));
    expect(resolveNavKey(key('Tab', { shiftKey: true }), ctx({ row: 19, col: 9 }))).toEqual(mv(19, 8));
  });

  it('Shift+Tab wraps from column 0 to the last column of the previous row', () => {
    expect(resolveNavKey(key('Tab', { shiftKey: true }), ctx({ row: 5, col: 0 }))).toEqual(mv(4, 9));
    expect(resolveNavKey(key('Tab', { shiftKey: true }), ctx({ row: 19, col: 0 }))).toEqual(mv(18, 9));
    expect(resolveNavKey(key('Tab', { shiftKey: true }), ctx({ row: 1, col: 0 }))).toEqual(mv(0, 9));
  });

  it('Shift+Tab returns null at cell (0,0)', () => {
    expect(resolveNavKey(key('Tab', { shiftKey: true }), ctx({ row: 0, col: 0 }))).toBeNull();
  });

  it('does not return null on row 0 after column 0 going back', () => {
    expect(resolveNavKey(key('Tab', { shiftKey: true }), ctx({ row: 0, col: 1 }))).toEqual(mv(0, 0));
  });

  it('never extends, with or without shift', () => {
    expect(resolveNavKey(key('Tab'), ctx())).toMatchObject({ extend: false });
    expect(resolveNavKey(key('Tab', { shiftKey: true }), ctx())).toMatchObject({ extend: false });
    expect(resolveNavKey(key('Tab'), ctx({ col: 9 }))).toMatchObject({ extend: false });
    expect(resolveNavKey(key('Tab', { shiftKey: true }), ctx({ col: 0 }))).toMatchObject({ extend: false });
  });

  it('returns null with ctrl or meta', () => {
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { ctrlKey: true, shiftKey: true }, { metaKey: true, shiftKey: true }]) {
      expect(resolveNavKey(key('Tab', mod), ctx())).toBeNull();
    }
  });

  it('wraps on every press in a one column grid', () => {
    const c = ctx({ colCount: 1, col: 0, row: 3 });
    expect(resolveNavKey(key('Tab'), c)).toEqual(mv(4, 0));
    expect(resolveNavKey(key('Tab', { shiftKey: true }), c)).toEqual(mv(2, 0));
    expect(resolveNavKey(key('Tab'), ctx({ colCount: 1, col: 0, row: 19 }))).toBeNull();
    expect(resolveNavKey(key('Tab', { shiftKey: true }), ctx({ colCount: 1, col: 0, row: 0 }))).toBeNull();
  });

  it('stays on the row in a one row grid until the end', () => {
    const c = ctx({ rowCount: 1, row: 0, col: 3 });
    expect(resolveNavKey(key('Tab'), c)).toEqual(mv(0, 4));
    expect(resolveNavKey(key('Tab', { shiftKey: true }), c)).toEqual(mv(0, 2));
    expect(resolveNavKey(key('Tab'), ctx({ rowCount: 1, row: 0, col: 9 }))).toBeNull();
    expect(resolveNavKey(key('Tab', { shiftKey: true }), ctx({ rowCount: 1, row: 0, col: 0 }))).toBeNull();
  });

  it('is the same whether or not the grid is editable', () => {
    expect(resolveNavKey(key('Tab'), ctx({ editable: false }))).toEqual(mv(5, 4));
  });
});

describe('resolveNavKey: Enter', () => {
  it('starts an edit with the text selected when editable', () => {
    expect(resolveNavKey(key('Enter'), ctx())).toEqual({ type: 'edit', mode: 'select-all' });
  });

  it('is blocked when not editable', () => {
    expect(resolveNavKey(key('Enter'), ctx({ editable: false }))).toEqual(BLOCKED);
  });

  it('returns null with shift', () => {
    expect(resolveNavKey(key('Enter', { shiftKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key('Enter', { shiftKey: true }), ctx({ editable: false }))).toBeNull();
  });

  it('returns null with ctrl or meta', () => {
    expect(resolveNavKey(key('Enter', { ctrlKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key('Enter', { metaKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key('Enter', { ctrlKey: true }), ctx({ editable: false }))).toBeNull();
    expect(resolveNavKey(key('Enter', { metaKey: true, shiftKey: true }), ctx())).toBeNull();
  });
});

describe('resolveNavKey: F2, Delete and Backspace', () => {
  it('F2 starts an edit with the cursor at the end when editable', () => {
    expect(resolveNavKey(key('F2'), ctx())).toEqual({ type: 'edit', mode: 'append' });
  });

  it('F2 is blocked when not editable', () => {
    expect(resolveNavKey(key('F2'), ctx({ editable: false }))).toEqual(BLOCKED);
  });

  it('Delete clears the cell without editing when editable', () => {
    expect(resolveNavKey(key('Delete'), ctx())).toEqual({ type: 'clear', thenEdit: false });
  });

  it('Delete is blocked when not editable', () => {
    expect(resolveNavKey(key('Delete'), ctx({ editable: false }))).toEqual(BLOCKED);
  });

  it('Backspace clears the cell and starts an edit when editable', () => {
    expect(resolveNavKey(key('Backspace'), ctx())).toEqual({ type: 'clear', thenEdit: true });
  });

  it('Backspace is blocked when not editable', () => {
    expect(resolveNavKey(key('Backspace'), ctx({ editable: false }))).toEqual(BLOCKED);
  });
});

describe('resolveNavKey: printable keys', () => {
  it.each(['a', 'Z', '0', '9', '-', '=', '/', '.', '*', '\u00e9', '\u{1F600}'])(
    'replaces the cell content with %j when editable',
    (k) => {
      expect(resolveNavKey(key(k), ctx())).toEqual({ type: 'edit', mode: 'replace', char: k });
    },
  );

  it('carries the exact character', () => {
    expect(resolveNavKey(key('\u00e9'), ctx())).toEqual({ type: 'edit', mode: 'replace', char: '\u00e9' });
    expect(resolveNavKey(key('\u{1F600}'), ctx())).toEqual({ type: 'edit', mode: 'replace', char: '\u{1F600}' });
  });

  it('allows shift, so capitals and shifted symbols type normally', () => {
    expect(resolveNavKey(key('A', { shiftKey: true }), ctx())).toEqual({ type: 'edit', mode: 'replace', char: 'A' });
    expect(resolveNavKey(key('!', { shiftKey: true }), ctx())).toEqual({ type: 'edit', mode: 'replace', char: '!' });
  });

  it.each(['a', 'Z', '5', '!', '\u{1F600}'])('is blocked for %j when not editable', (k) => {
    expect(resolveNavKey(key(k), ctx({ editable: false }))).toEqual(BLOCKED);
  });

  it('never starts an edit from the space: a plain space ticks the row, Shift+Space selects the row range', () => {
    expect(resolveNavKey(key(' '), ctx())).toEqual({ type: 'tick-row' });
    expect(resolveNavKey(key(' ', { shiftKey: true }), ctx())).toEqual({ type: 'select-row' });
  });

  // Z and Y are not in this list any more: Ctrl or Cmd with them is undo and redo (see below).
  it.each(['c', 'v', 'x', 'f', '5', ' '])('returns null for ctrl+%s and meta+%s', (k) => {
    expect(resolveNavKey(key(k, { ctrlKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key(k, { metaKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key(k, { ctrlKey: true, shiftKey: true }), ctx())).toBeNull();
  });

  it('returns null with a modifier even when the grid is not editable', () => {
    expect(resolveNavKey(key('c', { ctrlKey: true }), ctx({ editable: false }))).toBeNull();
    expect(resolveNavKey(key('v', { metaKey: true }), ctx({ editable: false }))).toBeNull();
  });
});

/** Pretends to be a Mac or another platform for the code that asks navigator.platform. */
const onPlatform = (platform: string) => vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);

describe('resolveNavKey: characters typed with Alt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const EDIT = (char: string): NavAction => ({ type: 'edit', mode: 'replace', char });

  describe('AltGr (Windows and Linux report it as Ctrl and Alt together)', () => {
    it.each(['@', '{', '}', '[', ']', '\\', '|', '\u20ac', '~', '\u00b5', 'q'])('starts an edit with %j', (k) => {
      onPlatform('Win32');
      expect(resolveNavKey(key(k, { ctrlKey: true, altKey: true }), ctx())).toEqual(EDIT(k));
    });

    it('also when the browser says AltGraph is down, with or without Ctrl', () => {
      onPlatform('Win32');
      const altGraph = { getModifierState: (name: string) => name === 'AltGraph' };
      expect(resolveNavKey({ key: '@', altKey: true, ...altGraph }, ctx())).toEqual(EDIT('@'));
      expect(resolveNavKey({ key: '\u20ac', ctrlKey: true, altKey: true, ...altGraph }, ctx())).toEqual(EDIT('\u20ac'));
      // The modifier alone, with no altKey, is not Alt at all.
      expect(resolveNavKey({ key: 'a', ...altGraph }, ctx())).toEqual(EDIT('a'));
    });

    it('asks only about AltGraph', () => {
      onPlatform('Linux x86_64');
      const ask = vi.fn(() => false);
      resolveNavKey({ key: '@', altKey: true, getModifierState: ask }, ctx());
      expect(ask).toHaveBeenCalledTimes(1);
      expect(ask).toHaveBeenCalledWith('AltGraph');
    });

    it('is blocked, like any typed character, when the table cannot be edited', () => {
      onPlatform('Win32');
      expect(resolveNavKey(key('@', { ctrlKey: true, altKey: true }), ctx({ editable: false }))).toEqual(BLOCKED);
    });

    it('does nothing on a table with no cells', () => {
      onPlatform('Win32');
      expect(resolveNavKey(key('@', { ctrlKey: true, altKey: true }), ctx({ rowCount: 0 }))).toBeNull();
      expect(resolveNavKey(key('@', { ctrlKey: true, altKey: true }), ctx({ colCount: 0 }))).toBeNull();
    });

    it('is never undo, redo, select all or a shortcut, whatever letter it carries', () => {
      onPlatform('Win32');
      for (const k of ['z', 'y', 'a', 'c', 'v', 'x', 'f']) {
        expect(resolveNavKey(key(k, { ctrlKey: true, altKey: true }), ctx())).toEqual(EDIT(k));
      }
    });

    it('Alt with a key that is not a character stays unhandled, AltGr or not', () => {
      onPlatform('Win32');
      for (const k of ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Home', 'F2', 'Delete', 'Backspace', 'PageDown', 'Dead', 'AltGraph', 'Alt']) {
        expect(resolveNavKey(key(k, { ctrlKey: true, altKey: true }), ctx())).toBeNull();
        expect(resolveNavKey(key(k, { altKey: true }), ctx())).toBeNull();
      }
    });
  });

  describe('Option on a Mac', () => {
    it.each(['@', '\u20ac', '\u00e5', '\u00df', '\u2211', '{', '|'])('starts an edit with %j', (k) => {
      onPlatform('MacIntel');
      expect(resolveNavKey(key(k, { altKey: true }), ctx())).toEqual(EDIT(k));
    });

    it('is blocked when the table cannot be edited', () => {
      onPlatform('MacIntel');
      expect(resolveNavKey(key('@', { altKey: true }), ctx({ editable: false }))).toEqual(BLOCKED);
    });

    it('Option with an arrow, Enter and the other named keys stays unhandled', () => {
      onPlatform('MacIntel');
      for (const k of ['ArrowDown', 'ArrowLeft', 'Enter', 'Tab', 'Backspace', 'Delete', 'Escape', 'Dead']) {
        expect(resolveNavKey(key(k, { altKey: true }), ctx())).toBeNull();
      }
    });

    it('Command with Option is a browser or system shortcut and never starts an edit', () => {
      onPlatform('MacIntel');
      expect(resolveNavKey(key('i', { altKey: true, metaKey: true }), ctx())).toBeNull();
      expect(resolveNavKey(key('\u00e5', { altKey: true, metaKey: true }), ctx())).toBeNull();
      expect(resolveNavKey(key('@', { altKey: true, metaKey: true, ctrlKey: true }), ctx())).toBeNull();
    });
  });

  describe('plain Alt elsewhere', () => {
    it.each(['a', 'f', 'e', '7', ' ', '@'])('does nothing for Alt+%j on Windows or Linux', (k) => {
      for (const platform of ['Win32', 'Linux x86_64']) {
        onPlatform(platform);
        expect(resolveNavKey(key(k, { altKey: true }), ctx())).toBeNull();
        expect(resolveNavKey(key(k, { altKey: true, shiftKey: true }), ctx())).toBeNull();
      }
    });

    it('does nothing for Alt with Meta, and for a getModifierState that says no', () => {
      onPlatform('Win32');
      expect(resolveNavKey(key('a', { altKey: true, metaKey: true }), ctx())).toBeNull();
      expect(resolveNavKey({ key: 'a', altKey: true, getModifierState: () => false }, ctx())).toBeNull();
    });

    it('does not change Ctrl or Cmd without Alt', () => {
      onPlatform('Win32');
      expect(resolveNavKey(key('z', { ctrlKey: true }), ctx())).toEqual({ type: 'undo' });
      expect(resolveNavKey(key('a', { ctrlKey: true }), ctx())).toEqual({ type: 'select-all' });
      expect(resolveNavKey(key('c', { ctrlKey: true }), ctx())).toBeNull();
    });
  });

  it('AltGr in an open cell is for the text input, as every character is', () => {
    expect(resolveEditKey(key('@', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(resolveEditKey(key('\u20ac', { altKey: true }))).toBeNull();
  });
});

describe('resolveNavKey: keys that are not handled', () => {
  it.each([
    'Escape',
    'F1',
    'F3',
    'F5',
    'F12',
    'Insert',
    'F10',
    'CapsLock',
    'NumLock',
    'Shift',
    'Control',
    'Meta',
    'Alt',
    'AltGraph',
    'Dead',
    'Unidentified',
    'Process',
    '',
    '\u0000',
    '\u001b',
  ])('returns null for %j', (k) => {
    expect(resolveNavKey(key(k), ctx())).toBeNull();
    expect(resolveNavKey(key(k), ctx({ editable: false }))).toBeNull();
  });

  it('returns null for Escape with modifiers too', () => {
    expect(resolveNavKey(key('Escape', { shiftKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key('Escape', { ctrlKey: true }), ctx())).toBeNull();
  });
});

describe('resolveNavKey: select all (mod+A)', () => {
  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['ctrl and meta', { ctrlKey: true, metaKey: true }],
  ])('returns select-all for %s+A', (_name, mod) => {
    expect(resolveNavKey(key('a', mod), ctx())).toEqual({ type: 'select-all' });
  });

  it('also matches the capital letter, as reported with Caps Lock on', () => {
    expect(resolveNavKey(key('A', { ctrlKey: true }), ctx())).toEqual({ type: 'select-all' });
    expect(resolveNavKey(key('A', { metaKey: true }), ctx())).toEqual({ type: 'select-all' });
  });

  it('is allowed when the grid is read only', () => {
    expect(resolveNavKey(key('a', { ctrlKey: true }), ctx({ editable: false }))).toEqual({ type: 'select-all' });
    expect(resolveNavKey(key('a', { metaKey: true }), ctx({ editable: false }))).toEqual({ type: 'select-all' });
  });

  it('does not depend on hasSelection', () => {
    expect(resolveNavKey(key('a', { ctrlKey: true }), ctx({ hasSelection: true }))).toEqual({ type: 'select-all' });
    expect(resolveNavKey(key('a', { ctrlKey: true }), ctx({ hasSelection: false }))).toEqual({ type: 'select-all' });
  });

  it('returns null with shift (mod+Shift+A is not select all)', () => {
    expect(resolveNavKey(key('a', { ctrlKey: true, shiftKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key('A', { metaKey: true, shiftKey: true }), ctx())).toBeNull();
  });

  it('is not select all with alt: Ctrl and Alt together is AltGr, which types, and Cmd with Option does nothing', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    expect(resolveNavKey(key('a', { ctrlKey: true, altKey: true }), ctx())).toEqual({ type: 'edit', mode: 'replace', char: 'a' });
    expect(resolveNavKey(key('a', { metaKey: true, altKey: true }), ctx())).toBeNull();
    vi.restoreAllMocks();
  });

  it('a bare letter a still types, and is blocked when read only', () => {
    expect(resolveNavKey(key('a'), ctx())).toEqual({ type: 'edit', mode: 'replace', char: 'a' });
    expect(resolveNavKey(key('a'), ctx({ editable: false }))).toEqual(BLOCKED);
  });

  it('leaves other mod letters unhandled', () => {
    expect(resolveNavKey(key('b', { ctrlKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key('b', { ctrlKey: true }), ctx({ editable: false }))).toBeNull();
  });
});

describe('resolveNavKey: select row (Shift+Space)', () => {
  it('returns select-row for Shift+Space', () => {
    expect(resolveNavKey(key(' ', { shiftKey: true }), ctx())).toEqual({ type: 'select-row' });
  });

  it('is allowed when the grid is read only', () => {
    expect(resolveNavKey(key(' ', { shiftKey: true }), ctx({ editable: false }))).toEqual({ type: 'select-row' });
  });

  it('does not depend on hasSelection', () => {
    expect(resolveNavKey(key(' ', { shiftKey: true }), ctx({ hasSelection: true }))).toEqual({ type: 'select-row' });
    expect(resolveNavKey(key(' ', { shiftKey: true }), ctx({ hasSelection: false }))).toEqual({ type: 'select-row' });
  });

  it('returns null with ctrl, meta or alt added', () => {
    expect(resolveNavKey(key(' ', { shiftKey: true, ctrlKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key(' ', { shiftKey: true, metaKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key(' ', { shiftKey: true, altKey: true }), ctx())).toBeNull();
  });

  it('a plain space no longer types: it ticks the row, editable or not', () => {
    expect(resolveNavKey(key(' '), ctx())).toEqual({ type: 'tick-row' });
    expect(resolveNavKey(key(' '), ctx({ editable: false }))).toEqual({ type: 'tick-row' });
  });

  it('ctrl+Space and meta+Space stay unhandled', () => {
    expect(resolveNavKey(key(' ', { ctrlKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key(' ', { metaKey: true }), ctx())).toBeNull();
  });
});

describe('resolveNavKey: tick row (Space)', () => {
  it('returns tick-row for a plain space', () => {
    expect(resolveNavKey(key(' '), ctx())).toEqual({ type: 'tick-row' });
  });

  it('carries no cell: the grid ticks the active row it already knows', () => {
    expect(Object.keys(resolveNavKey(key(' '), ctx()) ?? {})).toEqual(['type']);
  });

  it('is allowed when the grid is read only, because ticking never changes data', () => {
    expect(resolveNavKey(key(' '), ctx({ editable: false }))).toEqual({ type: 'tick-row' });
  });

  it('does not depend on hasSelection, the active cell or the grid size', () => {
    expect(resolveNavKey(key(' '), ctx({ hasSelection: true }))).toEqual({ type: 'tick-row' });
    expect(resolveNavKey(key(' '), ctx({ hasSelection: false }))).toEqual({ type: 'tick-row' });
    expect(resolveNavKey(key(' '), ctx({ row: 0, col: 0 }))).toEqual({ type: 'tick-row' });
    expect(resolveNavKey(key(' '), ctx({ row: 19, col: 9 }))).toEqual({ type: 'tick-row' });
    expect(resolveNavKey(key(' '), ctx({ rowCount: 1, colCount: 1, row: 0, col: 0 }))).toEqual({ type: 'tick-row' });
  });

  it('treats missing modifier flags as not pressed', () => {
    expect(resolveNavKey({ key: ' ' }, ctx())).toEqual({ type: 'tick-row' });
    expect(
      resolveNavKey({ key: ' ', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false }, ctx()),
    ).toEqual({ type: 'tick-row' });
  });

  it('Shift+Space still selects the row range, not a tick', () => {
    expect(resolveNavKey(key(' ', { shiftKey: true }), ctx())).toEqual({ type: 'select-row' });
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['ctrl and meta', { ctrlKey: true, metaKey: true }],
    ['ctrl and shift', { ctrlKey: true, shiftKey: true }],
    ['meta and shift', { metaKey: true, shiftKey: true }],
    ['alt', { altKey: true }],
    ['alt and shift', { altKey: true, shiftKey: true }],
  ])('stays unhandled with %s held', (_name, mod) => {
    expect(resolveNavKey(key(' ', mod), ctx())).toBeNull();
    expect(resolveNavKey(key(' ', mod), ctx({ editable: false }))).toBeNull();
  });

  it('is not offered when there are no rows or no columns', () => {
    expect(resolveNavKey(key(' '), ctx({ rowCount: 0 }))).toBeNull();
    expect(resolveNavKey(key(' '), ctx({ colCount: 0 }))).toBeNull();
  });

  it('does not mutate the context it is given', () => {
    const c = ctx({ hasSelection: true });
    const copy = { ...c };
    resolveNavKey(key(' '), c);
    expect(c).toEqual(copy);
  });

  it('editing still starts with Enter, F2 or Backspace, not with the space', () => {
    expect(resolveNavKey(key('Enter'), ctx())).toEqual({ type: 'edit', mode: 'select-all' });
    expect(resolveNavKey(key('F2'), ctx())).toEqual({ type: 'edit', mode: 'append' });
    expect(resolveNavKey(key('Backspace'), ctx())).toEqual({ type: 'clear', thenEdit: true });
  });

  it('a leading space is typed in the open editor, which leaves it to the text input', () => {
    expect(resolveEditKey(key(' '))).toBeNull();
  });
});

describe('resolveNavKey: Escape', () => {
  it('collapses when there is a selection', () => {
    expect(resolveNavKey(key('Escape'), ctx({ hasSelection: true }))).toEqual({ type: 'collapse' });
  });

  it('returns null when there is no selection', () => {
    expect(resolveNavKey(key('Escape'), ctx({ hasSelection: false }))).toBeNull();
    expect(resolveNavKey(key('Escape'), ctx())).toBeNull();
  });

  it('collapses in read only mode too', () => {
    expect(resolveNavKey(key('Escape'), ctx({ editable: false, hasSelection: true }))).toEqual({ type: 'collapse' });
    expect(resolveNavKey(key('Escape'), ctx({ editable: false, hasSelection: false }))).toBeNull();
  });

  it.each([
    ['shift', { shiftKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['alt', { altKey: true }],
    ['ctrl and shift', { ctrlKey: true, shiftKey: true }],
  ])('returns null with %s even when there is a selection', (_name, mod) => {
    expect(resolveNavKey(key('Escape', mod), ctx({ hasSelection: true }))).toBeNull();
  });
});

describe('resolveNavKey: context menu', () => {
  it('the ContextMenu key opens the menu', () => {
    expect(resolveNavKey(key('ContextMenu'), ctx())).toEqual({ type: 'context-menu' });
  });

  it('Shift+F10 opens the menu', () => {
    expect(resolveNavKey(key('F10', { shiftKey: true }), ctx())).toEqual({ type: 'context-menu' });
  });

  it('is allowed when the grid is read only', () => {
    expect(resolveNavKey(key('ContextMenu'), ctx({ editable: false }))).toEqual({ type: 'context-menu' });
    expect(resolveNavKey(key('F10', { shiftKey: true }), ctx({ editable: false }))).toEqual({ type: 'context-menu' });
  });

  it('does not depend on hasSelection', () => {
    expect(resolveNavKey(key('ContextMenu'), ctx({ hasSelection: true }))).toEqual({ type: 'context-menu' });
    expect(resolveNavKey(key('F10', { shiftKey: true }), ctx({ hasSelection: true }))).toEqual({ type: 'context-menu' });
  });

  it('plain F10 and F10 with ctrl or meta stay unhandled', () => {
    expect(resolveNavKey(key('F10'), ctx())).toBeNull();
    expect(resolveNavKey(key('F10', { ctrlKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key('F10', { metaKey: true, shiftKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key('F10', { ctrlKey: true, shiftKey: true }), ctx())).toBeNull();
  });

  it('returns null with alt, like every other key', () => {
    expect(resolveNavKey(key('ContextMenu', { altKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key('F10', { altKey: true, shiftKey: true }), ctx())).toBeNull();
  });
});

describe('resolveNavKey: new rules on an empty grid', () => {
  it.each([
    ['select-all', key('a', { ctrlKey: true })],
    ['select-row', key(' ', { shiftKey: true })],
    ['tick-row', key(' ')],
    ['collapse', key('Escape')],
    ['context-menu', key('ContextMenu')],
    ['context-menu via Shift+F10', key('F10', { shiftKey: true })],
  ])('%s is not offered when there are no rows or columns', (_name, k) => {
    expect(resolveNavKey(k, ctx({ rowCount: 0, hasSelection: true }))).toBeNull();
    expect(resolveNavKey(k, ctx({ colCount: 0, hasSelection: true }))).toBeNull();
  });

  it('the clipboard shortcuts still return null', () => {
    for (const k of ['c', 'x', 'v']) {
      expect(resolveNavKey(key(k, { ctrlKey: true }), ctx({ hasSelection: true }))).toBeNull();
      expect(resolveNavKey(key(k, { metaKey: true }), ctx({ hasSelection: true }))).toBeNull();
    }
  });

  it('the undo and redo shortcuts are still offered, so deleted rows can be brought back', () => {
    for (const over of [{ rowCount: 0 }, { colCount: 0 }, { rowCount: 0, colCount: 0 }]) {
      expect(resolveNavKey(key('z', { ctrlKey: true }), ctx(over))).toEqual({ type: 'undo' });
      expect(resolveNavKey(key('z', { metaKey: true }), ctx(over))).toEqual({ type: 'undo' });
      expect(resolveNavKey(key('y', { ctrlKey: true }), ctx(over))).toEqual({ type: 'redo' });
      expect(resolveNavKey(key('Z', { ctrlKey: true, shiftKey: true }), ctx(over))).toEqual({ type: 'redo' });
    }
  });
});

describe('resolveNavKey: undo and redo', () => {
  const UNDO: NavAction = { type: 'undo' };
  const REDO: NavAction = { type: 'redo' };

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['ctrl and meta', { ctrlKey: true, metaKey: true }],
  ])('%s+Z is undo', (_name, mod) => {
    expect(resolveNavKey(key('z', mod), ctx())).toEqual(UNDO);
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
  ])('%s+Y is redo', (_name, mod) => {
    expect(resolveNavKey(key('y', mod), ctx())).toEqual(REDO);
  });

  it.each([
    ['ctrl', { ctrlKey: true, shiftKey: true }],
    ['meta', { metaKey: true, shiftKey: true }],
  ])('%s+Shift+Z is redo', (_name, mod) => {
    expect(resolveNavKey(key('z', mod), ctx())).toEqual(REDO);
    // With Shift held the browser reports the capital letter.
    expect(resolveNavKey(key('Z', mod), ctx())).toEqual(REDO);
  });

  it('matches the capital letter without Shift, as reported with Caps Lock on', () => {
    expect(resolveNavKey(key('Z', { ctrlKey: true }), ctx())).toEqual(UNDO);
    expect(resolveNavKey(key('Y', { metaKey: true }), ctx())).toEqual(REDO);
  });

  it('never reports blocked: a read only table has no history, and the grid says so itself', () => {
    const c = ctx({ editable: false });
    expect(resolveNavKey(key('z', { ctrlKey: true }), c)).toEqual(UNDO);
    expect(resolveNavKey(key('y', { ctrlKey: true }), c)).toEqual(REDO);
    expect(resolveNavKey(key('z', { metaKey: true, shiftKey: true }), c)).toEqual(REDO);
  });

  it('does not depend on the selection or the active cell', () => {
    for (const over of [
      { hasSelection: true },
      { hasSelection: false },
      { row: 0, col: 0 },
      { row: 19, col: 9 },
      { rowCount: 1, colCount: 1, row: 0, col: 0 },
    ]) {
      expect(resolveNavKey(key('z', { ctrlKey: true }), ctx(over))).toEqual(UNDO);
      expect(resolveNavKey(key('y', { ctrlKey: true }), ctx(over))).toEqual(REDO);
    }
  });

  it('leaves Shift+Y and the Shift combinations unhandled, and never turns Alt into undo or redo', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    expect(resolveNavKey(key('y', { ctrlKey: true, shiftKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key('y', { metaKey: true, shiftKey: true }), ctx())).toBeNull();
    // Ctrl and Alt together is AltGr: a typed character, not undo or redo.
    for (const alt of [{}, { shiftKey: true }]) {
      expect(resolveNavKey(key('z', { ctrlKey: true, altKey: true, ...alt }), ctx())).toEqual({ type: 'edit', mode: 'replace', char: 'z' });
      expect(resolveNavKey(key('y', { ctrlKey: true, altKey: true, ...alt }), ctx())).toEqual({ type: 'edit', mode: 'replace', char: 'y' });
    }
    expect(resolveNavKey(key('z', { metaKey: true, altKey: true }), ctx())).toBeNull();
    vi.restoreAllMocks();
  });

  it('a bare Z or Y still types, and is blocked when the grid is read only', () => {
    expect(resolveNavKey(key('z'), ctx())).toEqual({ type: 'edit', mode: 'replace', char: 'z' });
    expect(resolveNavKey(key('Y', { shiftKey: true }), ctx())).toEqual({ type: 'edit', mode: 'replace', char: 'Y' });
    expect(resolveNavKey(key('z'), ctx({ editable: false }))).toEqual(BLOCKED);
  });

  it('does not take other letters with a modifier', () => {
    expect(resolveNavKey(key('x', { ctrlKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key('w', { metaKey: true }), ctx())).toBeNull();
  });

  it('does not change the other shortcuts it sits beside', () => {
    expect(resolveNavKey(key('a', { ctrlKey: true }), ctx())).toEqual({ type: 'select-all' });
    expect(resolveNavKey(key(' ', { shiftKey: true }), ctx())).toEqual({ type: 'select-row' });
    expect(resolveNavKey(key(' '), ctx())).toEqual({ type: 'tick-row' });
  });

  it('does not mutate the context it is given', () => {
    const c = ctx();
    const copy = { ...c };
    resolveNavKey(key('z', { ctrlKey: true }), c);
    resolveNavKey(key('y', { ctrlKey: true }), c);
    expect(c).toEqual(copy);
  });
});

describe('resolveNavKey: small and large grids', () => {
  const single = (over: Partial<NavContext> = {}): NavContext =>
    ctx({ row: 0, col: 0, rowCount: 1, colCount: 1, pageRows: 10, ...over });

  it('every movement key stays on the only cell', () => {
    const c = single();
    for (const name of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageDown', 'PageUp']) {
      expect(resolveNavKey(key(name), c)).toEqual(mv(0, 0));
      expect(resolveNavKey(key(name, { shiftKey: true }), c)).toEqual(mv(0, 0, true));
    }
    expect(resolveNavKey(key('Home', { ctrlKey: true }), c)).toEqual(mv(0, 0));
    expect(resolveNavKey(key('End', { metaKey: true }), c)).toEqual(mv(0, 0));
    expect(resolveNavKey(key('ArrowDown', { ctrlKey: true }), c)).toEqual(mv(0, 0));
  });

  it('Tab and Shift+Tab both let focus leave a one cell grid', () => {
    expect(resolveNavKey(key('Tab'), single())).toBeNull();
    expect(resolveNavKey(key('Tab', { shiftKey: true }), single())).toBeNull();
  });

  it('editing keys work on a one cell grid', () => {
    expect(resolveNavKey(key('Enter'), single())).toEqual({ type: 'edit', mode: 'select-all' });
    expect(resolveNavKey(key('a'), single())).toEqual({ type: 'edit', mode: 'replace', char: 'a' });
    expect(resolveNavKey(key('Enter'), single({ editable: false }))).toEqual(BLOCKED);
  });

  it('handles the largest grid: 10,000 rows by 20 columns', () => {
    const big = ctx({ row: 5000, col: 10, rowCount: 10000, colCount: 20, pageRows: 25 });
    expect(resolveNavKey(key('End', { ctrlKey: true }), big)).toEqual(mv(9999, 19));
    expect(resolveNavKey(key('Home', { metaKey: true }), big)).toEqual(mv(0, 0));
    expect(resolveNavKey(key('PageDown'), big)).toEqual(mv(5025, 10));
    expect(resolveNavKey(key('PageDown'), { ...big, row: 9990 })).toEqual(mv(9999, 10));
    expect(resolveNavKey(key('Tab'), { ...big, row: 9999, col: 19 })).toBeNull();
    expect(resolveNavKey(key('Tab'), { ...big, row: 9998, col: 19 })).toEqual(mv(9999, 0));
  });
});

describe('resolveEditKey', () => {
  it('Enter commits and moves down', () => {
    expect(resolveEditKey(key('Enter'))).toEqual({ type: 'commit', move: 'down' });
  });

  it('Shift+Enter commits and moves up', () => {
    expect(resolveEditKey(key('Enter', { shiftKey: true }))).toEqual({ type: 'commit', move: 'up' });
  });

  it('Tab commits and moves right', () => {
    expect(resolveEditKey(key('Tab'))).toEqual({ type: 'commit', move: 'right' });
  });

  it('Shift+Tab commits and moves left', () => {
    expect(resolveEditKey(key('Tab', { shiftKey: true }))).toEqual({ type: 'commit', move: 'left' });
  });

  it('Escape cancels', () => {
    expect(resolveEditKey(key('Escape'))).toEqual({ type: 'cancel' });
  });

  it.each([
    ['alt', { altKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['meta', { metaKey: true }],
    ['ctrl and shift', { ctrlKey: true, shiftKey: true }],
    ['alt and shift', { altKey: true, shiftKey: true }],
    ['all four', { altKey: true, ctrlKey: true, metaKey: true, shiftKey: true }],
  ])('returns null for Enter, Tab and Escape with %s', (_name, mod) => {
    expect(resolveEditKey(key('Enter', mod))).toBeNull();
    expect(resolveEditKey(key('Tab', mod))).toBeNull();
    expect(resolveEditKey(key('Escape', mod))).toBeNull();
  });

  it.each([
    'a',
    'Z',
    '5',
    ' ',
    '\u{1F600}',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
    'Backspace',
    'Delete',
    'F2',
    'PageDown',
    'Shift',
    'Dead',
    '',
  ])('leaves %j to the text input', (k) => {
    expect(resolveEditKey(key(k))).toBeNull();
    expect(resolveEditKey(key(k, { shiftKey: true }))).toBeNull();
  });

  it('leaves editing shortcuts such as ctrl+a and meta+c to the text input', () => {
    expect(resolveEditKey(key('a', { ctrlKey: true }))).toBeNull();
    expect(resolveEditKey(key('c', { metaKey: true }))).toBeNull();
    expect(resolveEditKey(key('z', { ctrlKey: true }))).toBeNull();
  });

  it('leaves undo and redo to the text input, which keeps the browser text undo', () => {
    for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
      expect(resolveEditKey(key('z', mod))).toBeNull();
      expect(resolveEditKey(key('y', mod))).toBeNull();
      expect(resolveEditKey(key('z', { ...mod, shiftKey: true }))).toBeNull();
    }
  });

  it('treats missing modifier flags as not pressed', () => {
    expect(resolveEditKey({ key: 'Enter' })).toEqual({ type: 'commit', move: 'down' });
    expect(resolveEditKey({ key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })).toEqual({
      type: 'commit',
      move: 'down',
    });
  });
});
