/**
 * @file crtCellMarkers.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Splits the text of a cell into the pieces the grid draws when it has whitespace at its edges:
 * a run of visible markers for the leading whitespace, the middle of the text exactly as stored,
 * and a run of markers for the trailing whitespace. A cell is drawn on one line with collapsed
 * whitespace, so without markers a leading or trailing space can not be seen at all, yet it
 * changes what the lookup matches. No React and no DOM, so the rules can be tested on their own.
 */

import { edgeSpaces } from './crtWarnings';

/** The marker drawn for every whitespace character at an edge: a middle dot. */
export const CRT_SPACE_MARK = '·';

/**
 * Most markers drawn for one run. A column is at most a few hundred pixels wide, so more dots than
 * this are clipped anyway, and a cell holding thousands of spaces must not put thousands of
 * characters in the page for every redraw.
 */
export const CRT_MAX_MARKS = 100;

/** A cell with whitespace at an edge, ready to draw. `lead` and `trail` are marker text, '' for none. */
export interface CrtMarkedText {
  lead: string;
  /** The text between the two runs, unchanged. Empty when the cell is only whitespace. */
  middle: string;
  trail: string;
  /** What to tell the user on hover: which edge has the space. */
  note: string;
}

const markers = (count: number): string => CRT_SPACE_MARK.repeat(Math.min(count, CRT_MAX_MARKS));

/**
 * The pieces of a cell that has leading or trailing whitespace, or null when it has none. Null is
 * the answer for nearly every cell, so the grid keeps its plain text child for those (edgeSpaces
 * looks at the two end characters first and allocates nothing in that case). Every whitespace
 * character, a tab and a no-break space included, becomes one marker. A cell that is only
 * whitespace is all markers and no middle.
 */
export function markEdgeSpaces(text: string): CrtMarkedText | null {
  const { lead, trail } = edgeSpaces(text);
  if (lead === 0 && trail === 0) return null;

  // Whitespace is a single UTF-16 unit, so the two counts slice the text exactly.
  const middle = text.slice(lead, text.length - trail);
  let note = 'Trailing space';
  if (middle === '') note = 'Only whitespace';
  else if (lead > 0) note = trail > 0 ? 'Leading and trailing space' : 'Leading space';

  return { lead: markers(lead), middle, trail: markers(trail), note };
}
