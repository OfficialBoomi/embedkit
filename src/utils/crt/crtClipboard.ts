/**
 * @file crtClipboard.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Pure helpers for moving cells through the clipboard as tab separated text, the format
 * spreadsheets read and write. A cell that holds a tab, a line break or a double quote is
 * wrapped in double quotes (inner quotes doubled), so what the grid copies pastes back
 * unchanged, and so do cells copied out of a spreadsheet. No React, no browser APIs.
 */
import { parseCsv } from './parseCsv';

const TAB = '\t';
const BOM = '﻿';

/**
 * Quotes a cell when its raw text would be read back as something else. A byte order mark at
 * the start of a cell is on the list because the reader drops one at the very start of the
 * text; behind an opening quote it is kept.
 */
function quoteCell(cell: string): string {
  if (/[\t\r\n"]/.test(cell) || cell.startsWith(BOM)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/**
 * Writes a matrix as tab separated text: cells joined by TAB, rows joined by LF, no line break
 * at the end. An empty matrix is ''.
 *
 * Rows must have the same number of cells (the grid always copies a rectangle). A row with no
 * cells at all has no text form and does not survive a round trip.
 *
 * The one case plain joining gets wrong is a last row that is a single empty cell. Its text
 * would be '' (so [['']] would read back as no data at all) or would end in a line break that
 * the reader drops as spreadsheet noise (so [['a'], ['']] would lose its last row). That cell
 * is therefore written as a quoted empty cell, "", which every spreadsheet reads as one empty
 * cell too. Empty cells anywhere else need no help: they are bare tabs or blank lines.
 */
export function toTsv(matrix: readonly (readonly string[])[]): string {
  const lines = matrix.map((row) => row.map(quoteCell).join(TAB));
  const last = matrix.length - 1;
  if (last >= 0 && matrix[last].length === 1 && matrix[last][0] === '') {
    lines[last] = '""';
  }
  return lines.join('\n');
}

/**
 * Reads clipboard text as a matrix of cells. '' gives no rows. Text with no tab and no line
 * break is one cell, spaces and commas included. A final line break is ignored, because
 * spreadsheets add one, and CRLF counts as one break. Rows are not forced to one width; use
 * fitColumns for that.
 *
 * Quoting follows the spreadsheet rule, so text that starts with a double quote is read as a
 * quoted cell even when it is a single cell: `"hi"` gives hi. That is what lets toTsv's output
 * round trip, and it matches what a spreadsheet does with the same text.
 */
export function parseClipboard(text: string): string[][] {
  return parseCsv(text, TAB);
}

/**
 * Pads each row with '' or cuts it to exactly `cols` cells. `cut` is true when a cell with
 * content fell off the end: padding never counts, and neither do empty cells, because copying
 * a wide range from a spreadsheet often leaves trailing tabs that carry nothing. Returns new
 * arrays and leaves the input alone.
 */
export function fitColumns(
  matrix: readonly (readonly string[])[],
  cols: number,
): { rows: string[][]; cut: boolean } {
  const width = Math.max(0, Math.floor(cols) || 0);
  let cut = false;
  const rows = matrix.map((row) => {
    for (let c = width; c < row.length; c++) {
      if (row[c] !== '') {
        cut = true;
        break;
      }
    }
    const out = row.slice(0, width);
    while (out.length < width) out.push('');
    return out;
  });
  return { rows, cut };
}

/** Reads rows r0..r1 and columns c0..c1 (inclusive) through `getCell` into a matrix. */
export function readMatrix(
  getCell: (row: number, col: number) => string,
  range: { r0: number; c0: number; r1: number; c1: number },
): string[][] {
  const out: string[][] = [];
  for (let r = range.r0; r <= range.r1; r++) {
    const line: string[] = [];
    for (let c = range.c0; c <= range.c1; c++) line.push(getCell(r, c));
    out.push(line);
  }
  return out;
}
