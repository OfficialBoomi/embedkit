/**
 * @file crtStore.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Data layer of the cross reference table editor. Pure TypeScript, no React, so a
 * grid, a future card view and the tests can all read the same store.
 *
 * Rows are kept as two parallel arrays: `rows` (the cell strings) and `ids` (a
 * stable id per row). Row ORDER matters, and ids let later row operations (insert,
 * delete, move, paste) keep edit tracking attached to the right row.
 *
 * A table is either showing the publisher's default rows (read only) or the
 * customer's override rows (editable). Edits are tracked sparsely: only the cells
 * that differ from the value they had when the rows were created are remembered.
 *
 * Row operations (insert, delete, move, block write, fill) only work on an override.
 * Edit tracking is keyed by row id, so it follows a row when rows around it change.
 * Rows created after the rows array was built are "new": the whole row counts as an
 * edit, so their individual cells are not tracked.
 */

import type { CrtTableData } from './crtTypes';

/** A cross reference table holds at most this many rows. */
export const CRT_MAX_ROWS = 10000;

export interface CrtSetCellsResult {
  /** Cells whose value changed. */
  changed: number;
  /** Rows appended because the matrix reached past the last row. */
  added: number;
  /** Matrix columns past the last column were dropped. */
  cutColumns: boolean;
  /** Growing would pass CRT_MAX_ROWS: nothing was applied. */
  overflow: boolean;
}

export interface CrtStore {
  /** The table this store was created from. Never mutated by the store. */
  readonly table: CrtTableData;
  /** Fixed column headers. */
  readonly columns: readonly string[];
  colCount(): number;
  rowCount(): number;
  /** The cell value, or '' when the address is out of range. */
  getCell(row: number, col: number): string;
  /** Stable row id, or -1 when the row is out of range. */
  rowId(row: number): number;
  isOverridden(): boolean;
  /** Same as isOverridden(): only an override can be edited. */
  isEditable(): boolean;
  /**
   * Stores the value exactly as given. True only when the stored value changed;
   * false when read only, out of range, or the value is the same.
   */
  setCell(row: number, col: number, value: string): boolean;
  /** No-op if already overridden; otherwise rows become a deep copy of the default rows. */
  override(): void;
  /** No-op if not overridden; otherwise rows go back to the default rows (read only). */
  reset(): void;
  /**
   * Inserts rows before index `at` (0..rowCount, rowCount appends). Each row is padded
   * or cut to the column count and copied. Returns the index of the first inserted row,
   * or -1 (nothing changed) when read only, `rows` is empty, `at` is not an integer in
   * range, or the table would pass CRT_MAX_ROWS.
   */
  insertRows(at: number, rows: readonly (readonly string[])[]): number;
  /**
   * Removes the rows at the given indexes, in any order; duplicates and out of range
   * values are ignored. Returns the number of rows removed (0 when read only).
   */
  deleteRows(indexes: readonly number[]): number;
  /**
   * Moves the selected rows one place up (-1) or down (+1). A selection touching the
   * edge it moves towards does not move at all. Returns the new sorted indexes of the
   * moved rows, or [] when nothing moved.
   */
  moveRows(indexes: readonly number[], delta: -1 | 1): number[];
  /**
   * Writes `matrix` with its top left corner at (row, col). Columns past the last column
   * are dropped. Rows past the last row are appended when `grow` is true, else dropped.
   * Returns null when read only or the start is not a cell of the grid.
   */
  setCells(row: number, col: number, matrix: readonly (readonly string[])[], grow?: boolean): CrtSetCellsResult | null;
  /**
   * Sets every cell of the inclusive range (any corner order, clamped to the grid) to
   * `value`. Returns the number of cells that changed.
   */
  fillCells(r0: number, c0: number, r1: number, c1: number, value: string): number;
  /** True for a row inserted or appended since the rows were created (load, override, reset). */
  isRowNew(row: number): boolean;
  /** True when the store differs from how it was loaded. */
  isDirty(): boolean;
  /** Number of cells of original rows whose value differs from the value they had when the rows were created. */
  changedCellCount(): number;
  /** Always false for a new row: the whole row is new. */
  isCellEdited(row: number, col: number): boolean;
  /** Starts at 0 and increments on every change. */
  version(): number;
  /** Listeners run synchronously after each change. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

interface ListenerEntry {
  fn: () => void;
  active: boolean;
}

/**
 * Returns a row with exactly `cols` cells: padded with '' or cut. A row that already
 * has the right length is returned as is unless `alwaysCopy` is set.
 */
function normalizeRow(row: readonly string[], cols: number, alwaysCopy: boolean): string[] {
  if (row.length === cols) return alwaysCopy ? row.slice() : (row as string[]);
  const out = row.slice(0, cols);
  while (out.length < cols) out.push('');
  return out;
}

function sequentialIds(count: number): number[] {
  const ids = new Array<number>(count);
  for (let i = 0; i < count; i++) ids[i] = i;
  return ids;
}

export function createCrtStore(table: CrtTableData): CrtStore {
  const columns: readonly string[] = table.columns.slice();
  const cols = columns.length;
  const loadedOverridden = table.overrideRows !== null && table.overrideRows !== undefined;

  /** Rows the store may mutate: always its own arrays. */
  const ownCopy = (source: readonly (readonly string[])[]): string[][] =>
    source.map((row) => normalizeRow(row, cols, true));

  /** Default rows for display only: right sized rows are shared with the table, never mutated. */
  const defaultView = (): string[][] => table.defaultRows.map((row) => normalizeRow(row, cols, false));

  let overridden = loadedOverridden;
  let rows: string[][] = loadedOverridden ? ownCopy(table.overrideRows as string[][]) : defaultView();
  let ids: number[] = sequentialIds(rows.length);
  /** Next id for a new row. Never reused, so a deleted row's id is gone for good. */
  let nextRowId = rows.length;
  /** Ids below this belong to the original rows; ids at or above it are new rows. */
  let newRowLimit = rows.length;
  let rowsReplaced = false;
  /**
   * True after a row was inserted, deleted, moved or appended. This is a simplification:
   * it never goes back to false when the change is undone by hand. A later change
   * journal replaces it with a precise answer.
   */
  let structureTouched = false;
  let versionNumber = 0;
  /** `${rowId}:${col}` -> the value the cell had when it was first edited. */
  let edits = new Map<string, string>();
  let listeners: ListenerEntry[] = [];

  const inRange = (row: number, col: number): boolean =>
    Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < rows.length && col >= 0 && col < cols;

  /** Fresh ids for the current rows; ids restart at 0..n-1 and every row counts as original. */
  const restartIds = (): void => {
    ids = sequentialIds(rows.length);
    nextRowId = rows.length;
    newRowLimit = rows.length;
  };

  /** Unique, in range, ascending. Never mutates the caller's array. */
  const normalizeIndexes = (indexes: readonly number[]): number[] => {
    const unique = new Set<number>();
    for (const index of indexes) {
      if (Number.isInteger(index) && index >= 0 && index < rows.length) unique.add(index);
    }
    return Array.from(unique).sort((a, b) => a - b);
  };

  /** Swaps two rows and their ids, so the id (and its edit tracking) travels with the row. */
  const swapRows = (a: number, b: number): void => {
    const row = rows[a];
    rows[a] = rows[b];
    rows[b] = row;
    const id = ids[a];
    ids[a] = ids[b];
    ids[b] = id;
  };

  /** Writes one existing cell with edit tracking and no notification. True when the value changed. */
  const writeCell = (row: number, col: number, value: string): boolean => {
    const current = rows[row][col];
    if (current === value) return false;
    const id = ids[row];
    // A new row is an edit as a whole, so its cells are not tracked one by one.
    if (id < newRowLimit) {
      const key = `${id}:${col}`;
      const original = edits.get(key);
      if (original === undefined) {
        edits.set(key, current);
      } else if (original === value) {
        edits.delete(key);
      }
    }
    rows[row][col] = value;
    return true;
  };

  const emit = (): void => {
    versionNumber += 1;
    const snapshot = listeners.slice();
    for (const entry of snapshot) {
      if (entry.active) entry.fn();
    }
  };

  return {
    table,
    columns,

    colCount: () => cols,
    rowCount: () => rows.length,

    getCell: (row, col) => (inRange(row, col) ? rows[row][col] : ''),
    rowId: (row) => (Number.isInteger(row) && row >= 0 && row < rows.length ? ids[row] : -1),

    isOverridden: () => overridden,
    isEditable: () => overridden,

    setCell(row, col, value) {
      if (!overridden || !inRange(row, col)) return false;
      if (!writeCell(row, col, value)) return false;
      emit();
      return true;
    },

    insertRows(at, newRows) {
      if (!overridden || newRows.length === 0) return -1;
      if (!Number.isInteger(at) || at < 0 || at > rows.length) return -1;
      if (rows.length + newRows.length > CRT_MAX_ROWS) return -1;
      const fresh = newRows.map((row) => normalizeRow(row, cols, true));
      const freshIds = fresh.map(() => nextRowId++);
      // concat instead of splice(at, 0, ...fresh): no argument limit for large inserts.
      rows = rows.slice(0, at).concat(fresh, rows.slice(at));
      ids = ids.slice(0, at).concat(freshIds, ids.slice(at));
      structureTouched = true;
      emit();
      return at;
    },

    deleteRows(indexes) {
      if (!overridden) return 0;
      const doomed = normalizeIndexes(indexes);
      if (doomed.length === 0) return 0;
      const doomedRows = new Set(doomed);
      const removedIds = new Set<number>();
      const keptRows: string[][] = [];
      const keptIds: number[] = [];
      for (let r = 0; r < rows.length; r++) {
        if (doomedRows.has(r)) {
          removedIds.add(ids[r]);
        } else {
          keptRows.push(rows[r]);
          keptIds.push(ids[r]);
        }
      }
      // Walk the sparse edits, not every cell of every removed row.
      for (const key of Array.from(edits.keys())) {
        if (removedIds.has(Number(key.slice(0, key.indexOf(':'))))) edits.delete(key);
      }
      rows = keptRows;
      ids = keptIds;
      structureTouched = true;
      emit();
      return doomed.length;
    },

    moveRows(indexes, delta) {
      if (!overridden || (delta !== -1 && delta !== 1)) return [];
      const selected = normalizeIndexes(indexes);
      if (selected.length === 0) return [];
      if (delta === -1) {
        if (selected[0] === 0) return [];
        // Ascending: a contiguous block moves as a unit, each row hops over the one above it.
        for (const r of selected) swapRows(r - 1, r);
      } else {
        if (selected[selected.length - 1] === rows.length - 1) return [];
        for (let i = selected.length - 1; i >= 0; i--) swapRows(selected[i], selected[i] + 1);
      }
      structureTouched = true;
      emit();
      return selected.map((r) => r + delta);
    },

    setCells(row, col, matrix, grow) {
      if (!overridden || !inRange(row, col)) return null;
      if (matrix.length === 0) return { changed: 0, added: 0, cutColumns: false, overflow: false };

      const needed = row + matrix.length;
      const growing = grow === true && needed > rows.length;
      // Matrix rows that are written, or that would have been written when growing is refused.
      const written = growing ? matrix.length : Math.min(matrix.length, rows.length - row);
      // Only cells with content count as cut: spreadsheets leave trailing empty cells on wide copies.
      let cutColumns = false;
      for (let i = 0; i < written && !cutColumns; i++) {
        const line = matrix[i];
        for (let j = cols - col; j < line.length; j++) {
          if (line[j] !== '') {
            cutColumns = true;
            break;
          }
        }
      }
      if (growing && needed > CRT_MAX_ROWS) return { changed: 0, added: 0, cutColumns, overflow: true };

      const existing = Math.min(written, rows.length - row);
      const width = cols - col;
      let changed = 0;
      for (let i = 0; i < existing; i++) {
        const line = matrix[i];
        const limit = Math.min(line.length, width);
        for (let j = 0; j < limit; j++) {
          if (writeCell(row + i, col + j, line[j])) changed += 1;
        }
      }
      // Appended rows start blank, so a cell counts as changed when it is not ''.
      for (let i = existing; i < written; i++) {
        const line = matrix[i];
        const limit = Math.min(line.length, width);
        const fresh = normalizeRow([], cols, false);
        for (let j = 0; j < limit; j++) {
          fresh[col + j] = line[j];
          if (line[j] !== '') changed += 1;
        }
        rows.push(fresh);
        ids.push(nextRowId++);
      }
      const added = written - existing;
      if (added > 0) structureTouched = true;
      if (changed > 0 || added > 0) emit();
      return { changed, added, cutColumns, overflow: false };
    },

    fillCells(r0, c0, r1, c1, value) {
      if (!overridden) return 0;
      if (![r0, c0, r1, c1].every(Number.isInteger)) return 0;
      const top = Math.max(0, Math.min(r0, r1));
      const bottom = Math.min(rows.length - 1, Math.max(r0, r1));
      const left = Math.max(0, Math.min(c0, c1));
      const right = Math.min(cols - 1, Math.max(c0, c1));
      let changed = 0;
      for (let r = top; r <= bottom; r++) {
        for (let c = left; c <= right; c++) {
          if (writeCell(r, c, value)) changed += 1;
        }
      }
      if (changed > 0) emit();
      return changed;
    },

    isRowNew: (row) => Number.isInteger(row) && row >= 0 && row < rows.length && ids[row] >= newRowLimit,

    override() {
      if (overridden) return;
      rows = ownCopy(table.defaultRows);
      restartIds();
      edits = new Map();
      overridden = true;
      rowsReplaced = true;
      structureTouched = false;
      emit();
    },

    reset() {
      if (!overridden) return;
      rows = defaultView();
      restartIds();
      edits = new Map();
      overridden = false;
      rowsReplaced = loadedOverridden;
      structureTouched = false;
      emit();
    },

    isDirty: () => rowsReplaced || structureTouched || edits.size > 0,
    changedCellCount: () => edits.size,
    isCellEdited: (row, col) => {
      const id = Number.isInteger(row) && row >= 0 && row < rows.length ? ids[row] : -1;
      return id >= 0 && edits.has(`${id}:${col}`);
    },

    version: () => versionNumber,

    subscribe(listener) {
      const entry: ListenerEntry = { fn: listener, active: true };
      listeners.push(entry);
      return () => {
        entry.active = false;
        listeners = listeners.filter((e) => e !== entry);
      };
    },
  };
}
