/**
 * @file gridLayout.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Geometry and DOM helpers of the lookup table grid: the pixel constants (the CSS reads the
 * same values through custom properties on the root), the column layout, the scroll
 * arithmetic, the virtualizer's rect observer, the precomputed class strings, and the readers
 * that turn a mouse event back into a cell or gutter address. Nothing here holds state.
 */

import type { Rect, Virtualizer } from '@tanstack/react-virtual';
import type { CrtStore } from '../../../utils/crt/crtStore';
import type { CrtCell } from '../../../utils/crt/crtTypes';

/** Pixel sizes. The CSS reads the same values through custom properties on the root. */
export const ROW_HEIGHT = 32;
export const HEADER_HEIGHT = 32;
/** Room for the row checkbox and a five digit row number. Keep in step with the CSS fallback. */
export const GUTTER_WIDTH = 88;
export const OVERSCAN = 12;

const MIN_COL_WIDTH = 96;
const MAX_COL_WIDTH = 320;
const DEFAULT_COL_WIDTH = 160;
const CHAR_WIDTH = 8;
const CELL_PADDING = 24;
/** Rows read to size the columns. Enough to be representative, cheap on 10,000 rows. */
const SAMPLE_ROWS = 100;

export const ROOT_STYLE = {
  '--crt-row-h': `${ROW_HEIGHT}px`,
  '--crt-header-h': `${HEADER_HEIGHT}px`,
  '--crt-gutter-w': `${GUTTER_WIDTH}px`,
} as React.CSSProperties;

export interface GridLayout {
  widths: number[];
  /** Left edge of each column in canvas coordinates (the gutter comes first). */
  lefts: number[];
  total: number;
  /** One shared style object per column, so cells do not allocate one each render. */
  styles: React.CSSProperties[];
  rowStyle: React.CSSProperties;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/** Widths come from the header and a sample of the first rows, computed once per store. */
export function computeLayout(store: CrtStore): GridLayout {
  const cols = store.colCount();
  const sample = Math.min(store.rowCount(), SAMPLE_ROWS);
  const widths: number[] = [];
  const lefts: number[] = [];
  const styles: React.CSSProperties[] = [];
  let x = GUTTER_WIDTH;
  for (let c = 0; c < cols; c++) {
    let longest = store.columns[c]?.length ?? 0;
    for (let r = 0; r < sample; r++) {
      longest = Math.max(longest, store.getCell(r, c).length);
    }
    const width =
      longest === 0
        ? DEFAULT_COL_WIDTH
        : clamp(longest * CHAR_WIDTH + CELL_PADDING, MIN_COL_WIDTH, MAX_COL_WIDTH);
    widths.push(width);
    lefts.push(x);
    styles.push({ width });
    x += width;
  }
  return { widths, lefts, total: x, styles, rowStyle: { width: x } };
}

/**
 * Horizontal scroll so a column is fully visible. The gutter and the first column are
 * sticky and cover the left edge, so the visible band starts after them.
 */
export function scrollColumnIntoView(el: HTMLElement, layout: GridLayout, col: number): void {
  if (col <= 0) {
    if (el.scrollLeft > 0) el.scrollLeft = 0;
    return;
  }
  const frozen = layout.lefts[1] ?? layout.total;
  const left = layout.lefts[col];
  const right = left + layout.widths[col];
  if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
  if (left < el.scrollLeft + frozen) el.scrollLeft = left - frozen;
}

/**
 * Vertical scroll so a row is fully visible. Rows have a fixed height, so the position is
 * plain arithmetic and never waits on the virtualizer to measure anything. That matters
 * with fast key repeat, where a measured scroll can lag behind the next key.
 */
export function scrollRowIntoView(el: HTMLElement, row: number): void {
  const top = HEADER_HEIGHT + row * ROW_HEIGHT;
  const bottom = top + ROW_HEIGHT;
  if (top < el.scrollTop + HEADER_HEIGHT) {
    el.scrollTop = top - HEADER_HEIGHT;
  } else if (bottom > el.scrollTop + el.clientHeight) {
    el.scrollTop = bottom - el.clientHeight;
  }
}

/**
 * Reports the client box (scrollbars excluded) instead of the border box, so the visible
 * row count never includes the part hidden under a horizontal scrollbar.
 */
export function observeGridRect(
  instance: Virtualizer<HTMLDivElement, Element>,
  cb: (rect: Rect) => void
): () => void {
  const el = instance.scrollElement;
  if (!el) return () => {};
  const report = () => cb({ width: el.clientWidth, height: el.clientHeight });
  report();
  if (typeof ResizeObserver === 'undefined') return () => {};
  const observer = new ResizeObserver(report);
  observer.observe(el);
  return () => observer.disconnect();
}

export const estimateRowSize = (): number => ROW_HEIGHT;

/**
 * Precomputed class strings: bit 1 frozen, 2 active, 4 edited, 8 editing, 16 in the cell range,
 * 32 matches the find query, 64 is the current find match. The current match is also a match,
 * so a cell that is current carries both bits (FLAG_MATCH_CURRENT).
 */
export const FLAG_MATCH = 32;
export const FLAG_MATCH_CURRENT = 96;

export const CELL_CLASS: string[] = [];
for (let flags = 0; flags < 128; flags++) {
  CELL_CLASS.push(
    [
      'boomi-crt-cell',
      flags & 1 ? 'boomi-crt-cell--frozen' : '',
      flags & 2 ? 'boomi-crt-cell--active' : '',
      flags & 4 ? 'boomi-crt-cell--edited' : '',
      flags & 8 ? 'boomi-crt-cell--editing' : '',
      flags & 16 ? 'boomi-crt-cell--selected' : '',
      flags & 32 ? 'boomi-crt-cell--match' : '',
      flags & 64 ? 'boomi-crt-cell--match-current' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}

/**
 * Row classes. Striping follows the displayed row number (row 1 is odd), not the DOM
 * position. Index: bit 1 even, bit 2 ticked, bit 4 new.
 */
export const ROW_CLASS: string[] = [];
for (let flags = 0; flags < 8; flags++) {
  ROW_CLASS.push(
    [
      'boomi-crt-row',
      flags & 1 ? 'boomi-crt-row--even' : 'boomi-crt-row--odd',
      flags & 2 ? 'boomi-crt-row--checked' : '',
      flags & 4 ? 'boomi-crt-row--new' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}

/** Gutter classes. Index: bit 1 active row, bit 2 new row. */
export const GUTTER_CLASS: string[] = [];
for (let flags = 0; flags < 4; flags++) {
  GUTTER_CLASS.push(
    [
      'boomi-crt-gutter',
      flags & 1 ? 'boomi-crt-gutter--active' : '',
      flags & 2 ? 'boomi-crt-gutter--new' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}

export const CHECK = 'boomi-crt-check';
export const CHECK_ON = 'boomi-crt-check boomi-crt-check--on';
export const CHECK_MIXED = 'boomi-crt-check boomi-crt-check--mixed';

/** Reads the cell address of a mouse event from the data attributes, or null off the cells. */
export function cellFromEvent(e: React.MouseEvent<HTMLElement>): CrtCell | null {
  const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-c]');
  const rowEl = cell?.parentElement;
  if (!cell || !rowEl || rowEl.dataset.r === undefined) return null;
  const row = Number(rowEl.dataset.r);
  const col = Number(cell.dataset.c);
  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null;
}

/** The row of the gutter cell under a mouse event, or null when the event is not on a gutter. */
export function gutterRowFromEvent(e: React.MouseEvent<HTMLElement>): number | null {
  const gutter = (e.target as HTMLElement).closest<HTMLElement>('[data-gutter]');
  const rowEl = gutter?.parentElement;
  if (!gutter || !rowEl || rowEl.dataset.r === undefined) return null;
  const row = Number(rowEl.dataset.r);
  return Number.isInteger(row) ? row : null;
}
