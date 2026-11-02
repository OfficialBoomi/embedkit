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
 */

import type { CrtTableData } from './crtTypes';

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
  /** True when the store differs from how it was loaded. */
  isDirty(): boolean;
  /** Number of cells whose value differs from the value they had when the rows were created. */
  changedCellCount(): number;
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
  let rowsReplaced = false;
  let versionNumber = 0;
  /** `${rowId}:${col}` -> the value the cell had when it was first edited. */
  let edits = new Map<string, string>();
  let listeners: ListenerEntry[] = [];

  const inRange = (row: number, col: number): boolean =>
    Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < rows.length && col >= 0 && col < cols;

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
      const current = rows[row][col];
      if (current === value) return false;
      const key = `${ids[row]}:${col}`;
      const original = edits.get(key);
      if (original === undefined) {
        edits.set(key, current);
      } else if (original === value) {
        edits.delete(key);
      }
      rows[row][col] = value;
      emit();
      return true;
    },

    override() {
      if (overridden) return;
      rows = ownCopy(table.defaultRows);
      ids = sequentialIds(rows.length);
      edits = new Map();
      overridden = true;
      rowsReplaced = true;
      emit();
    },

    reset() {
      if (!overridden) return;
      rows = defaultView();
      ids = sequentialIds(rows.length);
      edits = new Map();
      overridden = false;
      rowsReplaced = loadedOverridden;
      emit();
    },

    isDirty: () => rowsReplaced || edits.size > 0,
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
