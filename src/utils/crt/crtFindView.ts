/**
 * @file crtFindView.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The small pure rules behind the find and replace row of the cross reference table editor: the
 * debounce that keeps a search from running on every key, the per row column masks that let the
 * memoized grid rows know which of their cells match, the text of the match counter, which
 * match becomes current after a refresh or a replace, the notice that follows Replace all, and
 * which keys mean find. No React and no store; the matching rules themselves are in crtSearch.
 */

import type { KeyInput } from './crtKeymap';
import { firstMatchAtOrAfter, type CrtMatch } from './crtSearch';

/** How long a query, an option or a store change waits before the table is searched again. */
export const CRT_FIND_DEBOUNCE_MS = 200;

/** A function that waits for its calls to stop. `flush` runs a waiting call now, `cancel` drops it. */
export interface Debounced {
  (): void;
  cancel(): void;
  flush(): void;
}

/**
 * Calls `fn` once, `wait` ms after the last call. Written here instead of imported so a pending
 * run can be flushed (Enter right after typing must search first) and cancelled (closing the
 * find row must leave nothing behind).
 */
export function debounce(fn: () => void, wait: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    timer = null;
    fn();
  };
  const call = (() => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(run, wait);
  }) as Debounced;
  call.cancel = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };
  call.flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    run();
  };
  return call;
}

/**
 * Columns that fit in a row's match mask. A mask is one 32 bit number, and bit 31 is the sign
 * bit, so columns 0 to 30 are covered. A table has at most 20 columns; a column past the limit
 * is simply not highlighted.
 */
export const MAX_MASK_COLS = 31;

/**
 * Row index to the bit mask of its matching columns (bit c is set when column c matches).
 * Built once per list of matches, so a memoized row is handed a plain number and only a row
 * whose number changed has to draw again.
 */
export function buildRowMasks(matches: readonly CrtMatch[]): Map<number, number> {
  const masks = new Map<number, number>();
  for (const m of matches) {
    if (m.col < 0 || m.col >= MAX_MASK_COLS) continue;
    masks.set(m.row, (masks.get(m.row) ?? 0) | (1 << m.col));
  }
  return masks;
}

/** True when the mask has the bit of the column. A zero mask (the usual row) answers at once. */
export function maskHasCol(mask: number, col: number): boolean {
  return mask !== 0 && col >= 0 && col < MAX_MASK_COLS && (mask & (1 << col)) !== 0;
}

export interface FindStatusInput {
  query: string;
  /** The text of an invalid pattern, otherwise null. */
  error: string | null;
  count: number;
  /** Index of the current match, or -1. */
  current: number;
  /** More cells match than the search reports. */
  truncated: boolean;
}

/**
 * The counter next to the buttons. Empty while there is no query; the pattern's error for an
 * invalid regular expression; 'No matches'; '3 of 12'; and, when the search stopped at its
 * limit, '3 of 50,000+ matches'.
 */
export function findStatusText({ query, error, count, current, truncated }: FindStatusInput): string {
  if (query === '') return '';
  if (error) return error;
  if (count === 0) return 'No matches';
  const position = current >= 0 && current < count ? `${(current + 1).toLocaleString('en-US')} of ` : '';
  if (truncated) return `${position}${count.toLocaleString('en-US')}+ matches`;
  return `${position}${count.toLocaleString('en-US')}`;
}

/**
 * The current match after the table was searched again because of an edit, an undo or a
 * replace: the same position when it still exists, otherwise the last match, and -1 when there
 * are none. A search that had no current match starts at the first one.
 */
export function keepCurrentIndex(previous: number, count: number): number {
  if (count <= 0) return -1;
  return Math.min(Math.max(previous, 0), count - 1);
}

/**
 * The first match strictly after a cell, wrapping to the first match of the table, or -1 when
 * there are none. Replace uses it to move on: the cell just replaced may still match (a
 * replacement that contains the query), and must not be picked again.
 */
export function matchAfter(matches: readonly CrtMatch[], row: number, col: number): number {
  return firstMatchAtOrAfter(matches, row, col + 1);
}

/** The notice that follows Replace all. A cut plan is a warning that says to run it again. */
export function describeReplaceAll(
  changed: number,
  truncated: boolean
): { message: string; kind: 'info' | 'warn' } {
  const n = changed.toLocaleString('en-US');
  if (changed === 0) return { message: 'Nothing to replace', kind: 'info' };
  if (truncated) {
    return {
      message: `Replaced the first ${n} cells. More cells match, so run Replace all again.`,
      kind: 'warn',
    };
  }
  return { message: `Replaced ${n} ${changed === 1 ? 'cell' : 'cells'}`, kind: 'info' };
}

/** What a find key asks for: open the row (or focus its input), or step to the next or previous match. */
export type CrtFindCommand = 'open' | 'next' | 'prev';

/**
 * The find keys: Ctrl or Cmd+F opens, F3 steps forward and Shift+F3 steps back. Alt
 * combinations are left alone (AltGr is Ctrl+Alt on some keyboards and types characters), as
 * are Ctrl or Cmd with F3 and with Shift+F. The letter is compared case-insensitively because
 * Caps Lock reports 'F'.
 */
export function resolveFindKey(k: KeyInput): CrtFindCommand | null {
  if (k.altKey) return null;
  if (k.ctrlKey || k.metaKey) {
    return !k.shiftKey && k.key.toLowerCase() === 'f' ? 'open' : null;
  }
  if (k.key === 'F3') return k.shiftKey ? 'prev' : 'next';
  return null;
}
