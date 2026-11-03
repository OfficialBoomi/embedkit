/**
 * @file useGridClipboard.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Copy, cut and paste for the lookup table grid, over two paths that share one result step.
 * The toolbar and the menu use the async clipboard API (and ask for Ctrl+V when the browser
 * refuses); the keyboard uses the browser's own clipboard events. The pending paste (a
 * "paste with the keyboard next" request) and its timer live in CrtGrid, which clears them
 * when the table changes. Plain closures over the render's context, built on every render as
 * they were inside the component.
 */

import { fitColumns, parseClipboard, readMatrix, toTsv } from '../../../utils/crt/crtClipboard';
import {
  isMultiCell,
  NO_ROWS,
  selectionRange,
  type GridSelection,
} from '../../../utils/crt/crtGridSelection';
import {
  clipboardBlockedMessage,
  CUT_COLUMNS_MESSAGE,
  PASTE_HINT_MESSAGE,
  plural,
} from '../../../utils/crt/crtGridText';
import { rangeCols, rangeRows, type CrtRange } from '../../../utils/crt/crtSelection';
import type { GridContext, GridPendingPaste, PasteMode } from './crtGridTypes';
import type { GridRowOps } from './useGridRowOps';
import type { GridSelectionOps } from './useGridSelectionOps';
import { MAX_ROWS_MESSAGE } from './CrtToolbar';

/** How long a "paste with the keyboard next" request stays armed. */
const PENDING_PASTE_MS = 10000;

/** What a copy or cut put on the clipboard, and what a cut still has to remove. */
interface CopyPayload {
  text: string;
  label: string;
  /** Ticked rows to remove when this is a cut. */
  rows: number[] | null;
  /** The cell range to empty when this is a cut. */
  range: CrtRange | null;
  /** The store version it was read at, so a slow clipboard write cannot cut changed data. */
  version: number;
}

export interface GridClipboard {
  copyWithApi: (cut: boolean) => Promise<void>;
  pasteWithApi: (mode: PasteMode) => Promise<void>;
  handleCopy: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  handleCut: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
}

export function useGridClipboard(
  ctx: GridContext,
  selection: GridSelectionOps,
  rowOps: GridRowOps,
  pending: GridPendingPaste
): GridClipboard {
  const { store, storeRef, callbacksRef, scrollTargetRef, getSel, applySel, focusRoot, notice } = ctx;
  const { selectBlock, targetsOf } = selection;
  const { readRow, removeRows } = rowOps;
  const { pendingPasteRef, clearPending } = pending;

  const buildCopy = (): CopyPayload | null => {
    if (store.rowCount() === 0) return null;
    const s = getSel();
    const v = store.version();
    if (s.checked.length > 0) {
      const matrix = s.checked.map(readRow);
      return { text: toTsv(matrix), label: plural(matrix.length, 'row'), rows: s.checked, range: null, version: v };
    }
    const range = selectionRange(s);
    const matrix = readMatrix((r, c) => store.getCell(r, c), range);
    return {
      text: toTsv(matrix),
      label: plural(rangeRows(range) * rangeCols(range), 'cell'),
      rows: null,
      range,
      version: v,
    };
  };

  /** The data part of a cut, then the result message. Nothing is removed if the data moved on. */
  const finishCopy = (payload: CopyPayload, cut: boolean) => {
    if (!cut || store.version() !== payload.version) {
      notice(`Copied ${payload.label}`);
      return;
    }
    if (payload.rows) {
      removeRows(payload.rows, getSel().active.col);
    } else if (payload.range) {
      const r = payload.range;
      store.fillCells(r.r0, r.c0, r.r1, r.c1, '');
    }
    notice(`Cut ${payload.label}`);
  };

  /** Toolbar and menu path: the async clipboard API. Cut only removes data once the write worked. */
  const copyWithApi = async (cut: boolean) => {
    const payload = buildCopy();
    if (!payload) return;
    const failed = () => notice(clipboardBlockedMessage(cut ? 'X' : 'C'), 'warn');
    try {
      await navigator.clipboard.writeText(payload.text);
    } catch {
      failed();
      return;
    }
    if (storeRef.current !== store) return;
    finishCopy(payload, cut);
  };

  /** Keyboard path: the browser's own clipboard events. */
  const handleCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const payload = buildCopy();
    if (!payload) return;
    e.clipboardData.setData('text/plain', payload.text);
    // The host page must not see clipboard events it did not cause.
    e.preventDefault();
    e.stopPropagation();
    finishCopy(payload, false);
  };

  const handleCut = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (!store.isEditable()) {
      e.preventDefault();
      e.stopPropagation();
      callbacksRef.current.onBlocked?.();
      return;
    }
    const payload = buildCopy();
    if (!payload) return;
    e.clipboardData.setData('text/plain', payload.text);
    e.preventDefault();
    e.stopPropagation();
    finishCopy(payload, true);
  };

  /** Pastes whole rows as new rows above or below the target rows (or at the top of an empty table). */
  const pasteRows = (matrix: string[][], where: 'above' | 'below', s: GridSelection) => {
    const t = targetsOf(s);
    const at = t.length === 0 ? 0 : where === 'above' ? t[0] : t[t.length - 1] + 1;
    const fit = fitColumns(matrix, store.colCount());
    const index = store.insertRows(at, fit.rows);
    if (index < 0) {
      notice(MAX_ROWS_MESSAGE, 'warn');
      return;
    }
    selectBlock(index, index + fit.rows.length - 1);
    if (fit.cut) notice(CUT_COLUMNS_MESSAGE, 'warn');
    else notice(`Pasted ${plural(fit.rows.length, 'row')}`);
  };

  /** Pastes into the selected cells, growing the table when the text reaches past the last row. */
  const pasteCells = (matrix: string[][], s: GridSelection) => {
    const cols = store.colCount();
    const range = selectionRange(s);
    const ticked = s.checked.length > 0;
    const single = matrix.length === 1 && matrix[0].length === 1;
    if (single && !ticked && isMultiCell(range)) {
      // One value over a range fills the whole range, like a spreadsheet.
      store.fillCells(range.r0, range.c0, range.r1, range.c1, matrix[0][0]);
      notice(`Pasted ${plural(rangeRows(range) * rangeCols(range), 'cell')}`);
      return;
    }
    const startRow = ticked ? s.checked[0] : range.r0;
    const startCol = ticked ? 0 : range.c0;
    const result = store.setCells(startRow, startCol, matrix, true);
    if (!result) return;
    if (result.overflow) {
      notice(MAX_ROWS_MESSAGE, 'warn');
      return;
    }
    const width = matrix.reduce((w, row) => Math.max(w, row.length), 0);
    const r1 = Math.min(startRow + matrix.length - 1, store.rowCount() - 1);
    const c1 = Math.min(startCol + width - 1, cols - 1);
    const top = { row: startRow, col: startCol };
    applySel({ active: top, anchor: top, focus: { row: r1, col: c1 }, checked: NO_ROWS, rowAnchor: startRow });
    scrollTargetRef.current = { row: startRow, col: startCol };
    if (result.cutColumns) {
      notice(CUT_COLUMNS_MESSAGE, 'warn');
    } else if (ticked || width >= cols) {
      notice(`Pasted ${plural(matrix.length, 'row')}`);
    } else {
      notice(`Pasted ${plural(matrix.length * width, 'cell')}`);
    }
  };

  /** The one place text from the clipboard turns into table changes, for both paths. */
  const applyPaste = (text: string, mode: PasteMode) => {
    if (!store.isEditable()) {
      callbacksRef.current.onBlocked?.();
      return;
    }
    const matrix = parseClipboard(text);
    if (matrix.length === 0) {
      notice('The clipboard has nothing to paste');
      return;
    }
    const s = getSel();
    // An empty table has no cell to paste at, so its rows go in at the top.
    if (mode === 'paste' && store.rowCount() > 0) pasteCells(matrix, s);
    else pasteRows(matrix, mode === 'above' ? 'above' : 'below', s);
  };

  const armPendingPaste = (mode: PasteMode) => {
    clearPending();
    pendingPasteRef.current = { mode, timer: setTimeout(clearPending, PENDING_PASTE_MS) };
    notice(PASTE_HINT_MESSAGE);
  };

  /** Toolbar and menu path: read the clipboard, or ask for Ctrl+V when the browser refuses. */
  const pasteWithApi = async (mode: PasteMode) => {
    let text: string | null = null;
    // The browser may be showing a permission prompt, which gives the grid no sign at all.
    const waiting = setTimeout(() => notice('Waiting for clipboard permission...'), 300);
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = null;
    } finally {
      clearTimeout(waiting);
    }
    if (storeRef.current !== store) return;
    if (text === null) {
      armPendingPaste(mode);
      focusRoot();
      return;
    }
    applyPaste(text, mode);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    e.stopPropagation();
    const mode = pendingPasteRef.current?.mode ?? 'paste';
    clearPending();
    applyPaste(e.clipboardData.getData('text/plain'), mode);
  };

  return { copyWithApi, pasteWithApi, handleCopy, handleCut, handlePaste };
}
