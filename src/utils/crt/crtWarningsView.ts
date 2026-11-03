/**
 * @file crtWarningsView.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The small pure rules behind how the cross reference table editor shows its key warnings: the
 * per row flag that lets a memoized grid row know its key is flagged (a number, never a list), the
 * chips above the grid that say what is wrong and which rows they jump to, the jump itself, and
 * the hover text of a cell. The checks are in crtWarnings and the edge space markers in
 * crtCellMarkers. No React and no store.
 */

import type { CrtMarkedText } from './crtCellMarkers';
import { describeKeyWarnings, type CrtKeyWarnings } from './crtWarnings';

/** The key flag of a row: no warning, a blank key, or a key that appears in another row too. */
export const KEY_WARN_NONE = 0;
export const KEY_WARN_BLANK = 1;
export const KEY_WARN_DUPLICATE = 2;

/** Hover text of a flagged key cell, by flag. */
export const KEY_WARN_TITLE: Readonly<Record<number, string>> = {
  [KEY_WARN_BLANK]: 'Blank key',
  [KEY_WARN_DUPLICATE]: 'Duplicate key (this key appears more than once)',
};

/**
 * Row index to its key flag, only for flagged rows. Built once per set of warnings, so the grid
 * gives each memoized row one small number. A blank key never takes part in the duplicate check,
 * so a row never has both.
 */
export function buildKeyRowFlags(w: CrtKeyWarnings): Map<number, number> {
  const flags = new Map<number, number>();
  for (const row of w.blankRows) flags.set(row, KEY_WARN_BLANK);
  for (const row of w.duplicateRows) flags.set(row, KEY_WARN_DUPLICATE);
  return flags;
}

/** One warning chip: what it says and the rows it jumps between. */
export interface CrtKeyChip {
  kind: 'blank' | 'duplicate';
  /** The text on the chip, from describeKeyWarnings ('1 blank key', '2 duplicate keys'). */
  label: string;
  /** Tells a mouse user what pressing it does. */
  title: string;
  /** Ascending row indexes the chip steps through. */
  rows: readonly number[];
}

/**
 * The chips for a set of warnings, blank keys first, none for a clean table. The labels are the
 * lines describeKeyWarnings gives, in its order (blank, then duplicate), so the wording lives in
 * one place; a test holds the two together.
 */
export function buildKeyChips(w: CrtKeyWarnings): CrtKeyChip[] {
  const lines = describeKeyWarnings(w);
  const chips: CrtKeyChip[] = [];
  if (w.blankRows.length > 0) {
    chips.push({
      kind: 'blank',
      label: lines[chips.length],
      title: 'Jump to the next row with a blank key',
      rows: w.blankRows,
    });
  }
  if (w.duplicateRows.length > 0) {
    chips.push({
      kind: 'duplicate',
      label: lines[chips.length],
      title: 'Jump to the next row with a duplicate key',
      rows: w.duplicateRows,
    });
  }
  return chips;
}

/**
 * The flagged row a chip jumps to from the active row: the first one after it, wrapping to the
 * first of all. When the active row is the only flagged row the jump lands on it again. Returns
 * -1 when there are no flagged rows. `rows` is ascending.
 */
export function nextFlaggedRow(rows: readonly number[], from: number): number {
  if (rows.length === 0) return -1;
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid] > from) hi = mid;
    else lo = mid + 1;
  }
  return lo < rows.length ? rows[lo] : rows[0];
}

/**
 * The native tooltip of a cell. With no edge space and no key warning this is what the grid always
 * showed: the full text when it is long enough to be clipped, otherwise none. Otherwise it adds a
 * line for the key warning and one for the edge space, after the text when the text is shown too.
 */
export function cellTooltip(
  showText: boolean,
  text: string,
  marked: CrtMarkedText | null,
  keyWarn: number
): string | undefined {
  const keyTitle = KEY_WARN_TITLE[keyWarn];
  if (marked === null && keyTitle === undefined) return showText ? text : undefined;
  const lines: string[] = [];
  if (showText) lines.push(text);
  if (keyTitle !== undefined) lines.push(keyTitle);
  if (marked !== null) lines.push(marked.note);
  return lines.join('\n');
}
