/**
 * @file crtKeymap.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */
import { describe, it, expect } from 'vitest';
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
    expect(resolveNavKey(key(name, { altKey: true }), ctx())).toBeNull();
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
  it.each(['a', 'Z', '0', '9', '-', '=', '/', '.', '*', ' ', '\u00e9', '\u{1F600}'])(
    'replaces the cell content with %j when editable',
    (k) => {
      expect(resolveNavKey(key(k), ctx())).toEqual({ type: 'edit', mode: 'replace', char: k });
    },
  );

  it('carries the exact character, including the space', () => {
    const action = resolveNavKey(key(' '), ctx());
    expect(action).toEqual({ type: 'edit', mode: 'replace', char: ' ' });
  });

  it('allows shift, so capitals and shifted symbols type normally', () => {
    expect(resolveNavKey(key('A', { shiftKey: true }), ctx())).toEqual({ type: 'edit', mode: 'replace', char: 'A' });
    expect(resolveNavKey(key('!', { shiftKey: true }), ctx())).toEqual({ type: 'edit', mode: 'replace', char: '!' });
  });

  it.each(['a', 'Z', '5', '!', ' ', '\u{1F600}'])('is blocked for %j when not editable', (k) => {
    expect(resolveNavKey(key(k), ctx({ editable: false }))).toEqual(BLOCKED);
  });

  it.each(['c', 'v', 'x', 'z', 'y', 'a', 'f', '5', ' '])('returns null for ctrl+%s and meta+%s', (k) => {
    expect(resolveNavKey(key(k, { ctrlKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key(k, { metaKey: true }), ctx())).toBeNull();
    expect(resolveNavKey(key(k, { ctrlKey: true, shiftKey: true }), ctx())).toBeNull();
  });

  it('returns null with a modifier even when the grid is not editable', () => {
    expect(resolveNavKey(key('c', { ctrlKey: true }), ctx({ editable: false }))).toBeNull();
    expect(resolveNavKey(key('v', { metaKey: true }), ctx({ editable: false }))).toBeNull();
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
    'ContextMenu',
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

  it('treats missing modifier flags as not pressed', () => {
    expect(resolveEditKey({ key: 'Enter' })).toEqual({ type: 'commit', move: 'down' });
    expect(resolveEditKey({ key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })).toEqual({
      type: 'commit',
      move: 'down',
    });
  });
});
