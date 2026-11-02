/**
 * @file crtKeymap.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The keyboard rulebook of the lookup table grid. Pure functions: a key press plus
 * the grid state go in, an action comes out. The React grid calls these from its
 * keydown handler and performs the returned action, so the rules can be tested
 * without a DOM. A null result means "not handled": let the event bubble (or, in an
 * open cell input, let the text input handle the key natively).
 */

/** The parts of a keyboard event the rules read. */
export interface KeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/** Where the active cell is and what the grid allows. Cells are zero based. */
export interface NavContext {
  row: number;
  col: number;
  rowCount: number;
  colCount: number;
  /** Rows a PageUp / PageDown press jumps. Values below 1 are treated as 1. */
  pageRows: number;
  editable: boolean;
  /**
   * True when a multi-cell range or checked rows exist. Escape only means something
   * (collapse back to the active cell) in that case; otherwise it is left to bubble.
   * Omitted means false.
   */
  hasSelection?: boolean;
}

/** What the grid should do after a key press in navigation mode. */
export type NavAction =
  | { type: 'move'; row: number; col: number; extend: boolean }
  | { type: 'edit'; mode: 'select-all' | 'append' | 'replace'; char?: string }
  | { type: 'clear'; thenEdit: boolean }
  | { type: 'blocked' }
  | { type: 'select-all' }
  | { type: 'select-row' }
  | { type: 'collapse' }
  | { type: 'context-menu' };

/** What the grid should do after a key press in an open cell input. */
export type EditAction =
  | { type: 'commit'; move: 'down' | 'up' | 'right' | 'left' }
  | { type: 'cancel' };

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/** C0 controls, DEL and C1 controls. */
const isControlCode = (code: number): boolean => code <= 0x1f || (code >= 0x7f && code <= 0x9f);

/**
 * True when the key is exactly one Unicode code point and not a control character.
 * The space is printable. Key names such as 'Enter', 'Tab' or 'ArrowUp' are longer
 * than one code point, so they are not. The empty string is not.
 */
export function isPrintableKey(key: string): boolean {
  const chars = Array.from(key);
  if (chars.length !== 1) return false;
  return !isControlCode(chars[0].codePointAt(0) ?? 0);
}

/** Rows a page key moves: at least 1, always a whole number. */
const pageStep = (pageRows: number): number =>
  Number.isFinite(pageRows) ? Math.max(1, Math.floor(pageRows)) : 1;

/**
 * Resolve a key press while a cell is active and not being edited.
 * Returns null when the key is not handled so the event can bubble.
 */
export function resolveNavKey(k: KeyInput, c: NavContext): NavAction | null {
  if (c.rowCount <= 0 || c.colCount <= 0) return null;
  if (k.altKey) return null;

  const mod = !!(k.ctrlKey || k.metaKey);
  const shift = !!k.shiftKey;
  const lastRow = c.rowCount - 1;
  const lastCol = c.colCount - 1;

  const move = (row: number, col: number, extend: boolean): NavAction => ({
    type: 'move',
    row: clamp(row, 0, lastRow),
    col: clamp(col, 0, lastCol),
    extend,
  });
  const whenEditable = (action: NavAction): NavAction =>
    c.editable ? action : { type: 'blocked' };

  // Selection shortcuts never change data, so they work in read only mode too. They
  // sit ahead of the printable rule below, which would otherwise swallow the letter
  // (mod+A) or the space (Shift+Space). The key is compared case-insensitively
  // because Caps Lock reports 'A' without shift.
  if (mod && !shift && k.key.toLowerCase() === 'a') return { type: 'select-all' };
  if (shift && !mod && k.key === ' ') return { type: 'select-row' };

  switch (k.key) {
    case 'ArrowUp':
      return move(mod ? 0 : c.row - 1, c.col, shift);
    case 'ArrowDown':
      return move(mod ? lastRow : c.row + 1, c.col, shift);
    case 'ArrowLeft':
      return move(c.row, mod ? 0 : c.col - 1, shift);
    case 'ArrowRight':
      return move(c.row, mod ? lastCol : c.col + 1, shift);

    case 'Home':
      return mod ? move(0, 0, shift) : move(c.row, 0, shift);
    case 'End':
      return mod ? move(lastRow, lastCol, shift) : move(c.row, lastCol, shift);

    case 'PageDown':
      return mod ? null : move(c.row + pageStep(c.pageRows), c.col, shift);
    case 'PageUp':
      return mod ? null : move(c.row - pageStep(c.pageRows), c.col, shift);

    case 'Tab': {
      if (mod) return null;
      if (!shift) {
        if (c.col < lastCol) return move(c.row, c.col + 1, false);
        if (c.row < lastRow) return move(c.row + 1, 0, false);
        return null;
      }
      if (c.col > 0) return move(c.row, c.col - 1, false);
      if (c.row > 0) return move(c.row - 1, lastCol, false);
      return null;
    }

    case 'Enter':
      if (shift || mod) return null;
      return whenEditable({ type: 'edit', mode: 'select-all' });
    case 'F2':
      return whenEditable({ type: 'edit', mode: 'append' });
    case 'Delete':
      return whenEditable({ type: 'clear', thenEdit: false });
    case 'Backspace':
      return whenEditable({ type: 'clear', thenEdit: true });

    case 'Escape':
      if (shift || mod) return null;
      return c.hasSelection ? { type: 'collapse' } : null;

    // The dedicated menu key, and Shift+F10 for keyboards without one.
    case 'ContextMenu':
      return { type: 'context-menu' };
    case 'F10':
      return shift && !mod ? { type: 'context-menu' } : null;

    default:
      if (!isPrintableKey(k.key)) return null;
      if (mod) return null;
      return whenEditable({ type: 'edit', mode: 'replace', char: k.key });
  }
}

/**
 * Resolve a key press while a cell text input is open.
 * Returns null when the text input should handle the key natively.
 */
export function resolveEditKey(k: KeyInput): EditAction | null {
  if (k.altKey || k.ctrlKey || k.metaKey) return null;

  switch (k.key) {
    case 'Enter':
      return { type: 'commit', move: k.shiftKey ? 'up' : 'down' };
    case 'Tab':
      return { type: 'commit', move: k.shiftKey ? 'left' : 'right' };
    case 'Escape':
      return { type: 'cancel' };
    default:
      return null;
  }
}
