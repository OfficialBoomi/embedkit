/**
 * @file crtGridText.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The wording the lookup table grid shares between its row and clipboard operations: the
 * count labels in result messages ("3 rows deleted") and the clipboard notices. Pure, so the
 * grid's hooks can import them without pulling in React.
 */

/** "1 row", "2 rows", "10,000 rows". Counts use en-US grouping like the rest of the editor. */
export const plural = (n: number, one: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : `${one}s`}`;

export const CUT_COLUMNS_MESSAGE = 'Some columns did not fit and were skipped.';
export const PASTE_HINT_MESSAGE = 'Press Ctrl+V to paste';
export const clipboardBlockedMessage = (key: string): string =>
  `Your browser blocked clipboard access. Click the grid and press Ctrl+${key}.`;
