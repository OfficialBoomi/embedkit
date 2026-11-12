/**
 * @file crtWarnings.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Advisory checks on the key column (the first column) of a cross reference table: blank keys,
 * duplicate keys, and spaces at the edges of a cell. Nothing here blocks a save; the grid shows
 * the results as warnings. No React and no DOM, so the rules can be tested on their own. Rows and
 * columns are zero based, like the other crt helpers.
 */

/** Which rows of the key column need attention. Both row lists are ascending. */
export interface CrtKeyWarnings {
  /** Rows whose key is empty or only whitespace. */
  blankRows: number[];
  /** Rows whose key also appears in another row. Blank keys never take part. */
  duplicateRows: number[];
  /** Distinct keys that appear more than once. This counts keys, not rows. */
  duplicateKeyCount: number;
}

/** A key is blank when it is empty or only whitespace. \s is the same set that trim() removes. */
const BLANK_KEY = /^\s*$/;

/** One character of whitespace, used to walk the edges of a cell. */
const WHITESPACE = /\s/;

/**
 * The answer for a cell with no edge space. The grid asks for every visible cell on every render,
 * so the common case returns this one shared object instead of allocating. It is frozen so that
 * no caller can change the answer for every other caller.
 */
const NO_EDGE_SPACES = Object.freeze({ lead: 0, trail: 0 });

/**
 * Finds blank and duplicate keys in the first column. Each row is read once. Keys are compared
 * after toLowerCase() but never trimmed, so 'a' and 'a ' stay different keys; the edge space
 * marker is what flags the second one.
 */
export function checkKeys(
  getCell: (row: number, col: number) => string,
  rowCount: number,
): CrtKeyWarnings {
  const blankRows: number[] = [];
  // Keep each row's folded key so the duplicate pass does not call getCell a second time.
  const keys: Array<string | null> = [];
  const counts = new Map<string, number>();

  for (let row = 0; row < rowCount; row++) {
    const text = getCell(row, 0);
    if (BLANK_KEY.test(text)) {
      blankRows.push(row);
      keys.push(null);
      continue;
    }
    const key = text.toLowerCase();
    keys.push(key);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const duplicateRows: number[] = [];
  for (let row = 0; row < keys.length; row++) {
    const key = keys[row];
    if (typeof key === 'string' && (counts.get(key) ?? 0) > 1) duplicateRows.push(row);
  }

  let duplicateKeyCount = 0;
  for (const n of counts.values()) {
    if (n > 1) duplicateKeyCount++;
  }

  return { blankRows, duplicateRows, duplicateKeyCount };
}

/**
 * The whitespace run at the start and the end of a cell, in UTF-16 code units (what String.length
 * counts). A cell that is only whitespace reports all of it as lead, so the same characters are
 * never counted twice.
 */
export function edgeSpaces(text: string): { lead: number; trail: number } {
  const last = text.length - 1;
  // Most cells have no edge space. One look at each end settles that before any loop runs.
  if (last < 0 || (!WHITESPACE.test(text.charAt(0)) && !WHITESPACE.test(text.charAt(last)))) {
    return NO_EDGE_SPACES;
  }

  let lead = 0;
  while (lead <= last && WHITESPACE.test(text.charAt(lead))) lead++;
  if (lead > last) return { lead, trail: 0 };

  // There is a non-space character at or after `lead`, so this walk stops there and never passes it.
  let trail = 0;
  while (WHITESPACE.test(text.charAt(last - trail))) trail++;
  return { lead, trail };
}

/** '1 row' style text with a thousands separator, the same way the selection text formats counts. */
function countOf(n: number, word: string): string {
  return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * The short status lines for the warnings area, blank keys first. A kind with a zero count is
 * left out, so a clean table gives an empty array.
 */
export function describeKeyWarnings(w: CrtKeyWarnings): string[] {
  const lines: string[] = [];
  if (w.blankRows.length > 0) lines.push(countOf(w.blankRows.length, 'blank key'));
  if (w.duplicateKeyCount > 0) lines.push(countOf(w.duplicateKeyCount, 'duplicate key'));
  return lines;
}
