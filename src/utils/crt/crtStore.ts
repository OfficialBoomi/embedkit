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
 *
 * Every change on an override is also written to a sparse change journal (undo and
 * redo). The journal stores only what changed, never a copy of the table. It is a
 * stack, so an entry is only ever undone while the table is exactly as that entry
 * left it; that is why an entry can refer to row ids and positions and be sure they
 * exist.
 */

import type { CrtTableData } from './crtTypes';
import type { CrtRange } from './crtSelection';

/** A cross reference table holds at most this many rows. */
export const CRT_MAX_ROWS = 10000;

/** The history keeps at most this many steps; the oldest step is dropped first. */
export const CRT_MAX_HISTORY_ENTRIES = 500;

/**
 * The history keeps at most this many stored cells in total (a cells step counts its
 * length, an insert or delete step counts rows x columns, a move counts its rows).
 */
export const CRT_MAX_HISTORY_CELLS = 1000000;

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

/** What an undo or a redo did, so the grid can show it. */
export interface CrtHistoryResult {
  /** The step that was undone or redone, for example 'Delete 3 rows'. */
  label: string;
  /**
   * Bounding box, in the row indexes the table has now, of what the step touched,
   * clamped to the table. Null when the table is empty.
   */
  region: CrtRange | null;
}

/**
 * How the table now differs from how it was loaded, for the save bar and the save request. The
 * counts compare with the rows the store started from: the rows of the load, or after an override()
 * or reset() the rows that call put in place (those calls restart the comparison, but
 * `loadedOverridden` and `overridden` still tell what was loaded and what is showing).
 */
export interface CrtChangeSummary {
  /** The table was loaded with the customer's own rows. */
  loadedOverridden: boolean;
  /** The table shows the customer's own rows now. */
  overridden: boolean;
  /** Rows that are new. */
  added: number;
  /** Original rows with at least one edited cell. */
  edited: number;
  /** Original rows that are no longer there. */
  removed: number;
  /** The original rows that remain are no longer in their original relative order. */
  reordered: boolean;
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
  /** No-op if already overridden; otherwise rows become a deep copy of the default rows. Starts a fresh history. */
  override(): void;
  /** No-op if not overridden; otherwise rows go back to the default rows (read only). Starts a fresh history. */
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
   * Returns null when read only or the start is not a cell of the grid. The appended rows
   * and the written cells are one undo step.
   */
  setCells(row: number, col: number, matrix: readonly (readonly string[])[], grow?: boolean): CrtSetCellsResult | null;
  /**
   * Sets every cell of the inclusive range (any corner order, clamped to the grid) to
   * `value`. Returns the number of cells that changed.
   */
  fillCells(r0: number, c0: number, r1: number, c1: number, value: string): number;
  /** True for a row inserted or appended since the rows were created (load, override, reset). */
  isRowNew(row: number): boolean;
  /**
   * True when the table differs from how it was loaded. Exact and net: undoing every
   * change, or moving a row down and back up, makes it false again.
   */
  isDirty(): boolean;
  /**
   * A deep copy of the rows as they are now, in order, one string per column. Safe to keep or send:
   * later edits do not reach it. Works whether or not the table is overridden.
   */
  rowsSnapshot(): string[][];
  /** What changed since the rows were created, in rows. Read only; costs one pass over the rows. */
  changeSummary(): CrtChangeSummary;
  /** Number of cells of original rows whose value differs from the value they had when the rows were created. */
  changedCellCount(): number;
  /** Always false for a new row: the whole row is new. */
  isCellEdited(row: number, col: number): boolean;
  /** Starts at 0 and increments on every change (an undo, a redo or a whole batch is one change). */
  version(): number;
  /** Listeners run synchronously after each change. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /**
   * Reverts the latest step. Null (and no notification) when there is nothing to undo, the
   * table is read only, or a batch is running.
   */
  undo(): CrtHistoryResult | null;
  /** Re-applies the step the last undo reverted, with the same row ids. Same null rules as undo(). */
  redo(): CrtHistoryResult | null;
  canUndo(): boolean;
  canRedo(): boolean;
  /** What undo() would revert, for a tooltip (for example 'Delete 3 rows'), or null. */
  undoLabel(): string | null;
  redoLabel(): string | null;
  /**
   * Runs `fn` and makes every change it makes ONE undo step and ONE notification. Nested
   * batches join the outermost one, which also decides the label. If `fn` throws, what was
   * done is kept as one step and the error is rethrown. A batch that changed nothing
   * journals nothing and does not notify. Undo and redo are not available inside a batch.
   */
  batch<T>(fn: () => T, label?: string): T;
}

interface ListenerEntry {
  fn: () => void;
  active: boolean;
}

/** Cells written: parallel arrays, one slot per written cell, in the order they were written. */
interface CellsEntry {
  kind: 'cells';
  rowIds: number[];
  cols: number[];
  before: string[];
  after: string[];
}

/**
 * Rows inserted at `at`. `rows` are the very arrays the table holds. That is safe because
 * an entry is only used while the table is exactly as the entry left it, so the arrays hold
 * the same text then.
 */
interface InsertEntry {
  kind: 'insert';
  at: number;
  ids: number[];
  rows: string[][];
}

/**
 * Rows removed from the ascending `positions` they had, with the edit tracking dropped along.
 * The rows are shared with the table the same way as in InsertEntry.
 */
interface DeleteEntry {
  kind: 'delete';
  positions: number[];
  ids: number[];
  rows: string[][];
  dropped: Array<[key: string, original: string]>;
}

/** `indexes` are where the moved rows ended up, so the inverse is the move the other way. */
interface MoveEntry {
  kind: 'move';
  indexes: number[];
  delta: -1 | 1;
}

interface GroupEntry {
  kind: 'group';
  children: JournalEntry[];
}

type JournalEntry = CellsEntry | InsertEntry | DeleteEntry | MoveEntry | GroupEntry;

/** One undo step: an entry with the text a tooltip shows and the memory it holds. */
interface JournalStep {
  entry: JournalEntry;
  label: string;
  cost: number;
}

interface OpenBatch {
  children: JournalEntry[];
  label: string | undefined;
}

/** Rows (as ids) and columns an undo or redo touched, resolved to a range once it is done. */
interface Touched {
  ids: number[];
  c0: number;
  c1: number;
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

const formatCount = (count: number): string => count.toLocaleString('en-US');

const cellsLabel = (count: number): string => (count === 1 ? 'Edit cell' : `Edit ${formatCount(count)} cells`);

const rowsLabel = (verb: string, count: number): string =>
  count === 1 ? `${verb} row` : `${verb} ${formatCount(count)} rows`;

/** Looking up this few ids is cheaper with a scan than with building an id to index map. */
const SMALL_LOOKUP = 8;

export function createCrtStore(table: CrtTableData): CrtStore {
  const columns: readonly string[] = table.columns.slice();
  const cols = columns.length;
  const lastCol = Math.max(cols - 1, 0);
  const loadedOverridden = table.overrideRows !== null && table.overrideRows !== undefined;

  /** Rows the store may mutate: always its own arrays. */
  const ownCopy = (source: readonly (readonly string[])[]): string[][] =>
    source.map((row) => normalizeRow(row, cols, true));

  /** Default rows for display only: right sized rows are shared with the table, never mutated. */
  const defaultView = (): string[][] => table.defaultRows.map((row) => normalizeRow(row, cols, false));

  let overridden = loadedOverridden;
  let rows: string[][] = loadedOverridden ? ownCopy(table.overrideRows as string[][]) : defaultView();
  let ids: number[] = sequentialIds(rows.length);
  /** Next id for a new row. Never reused or rewound, not even by an undo. */
  let nextRowId = rows.length;
  /** Ids below this belong to the original rows; ids at or above it are new rows. */
  let newRowLimit = rows.length;
  let rowsReplaced = false;
  /**
   * Whether `ids` differs from 0..newRowLimit-1 in order, or null when it must be computed
   * again. Every change to `ids` resets it, so the scan runs at most once per structure change.
   * Dirtiness reads this and never the journal, so trimming old history can not change it.
   */
  let structureDiffers: boolean | null = false;
  /** id -> index for the current `ids`, built on demand and dropped whenever `ids` changes. */
  let idIndex: Map<number, number> | null = null;
  let versionNumber = 0;
  /** `${rowId}:${col}` -> the value the cell had when it was first edited. */
  let edits = new Map<string, string>();
  let listeners: ListenerEntry[] = [];

  /** Oldest step first. Undone steps wait on the redo stack until a new change drops them. */
  const undoStack: JournalStep[] = [];
  const redoStack: JournalStep[] = [];
  /** Cost of every step on both stacks. Undo and redo only move steps, so it only changes on a push, a trim or a drop. */
  let storedCells = 0;
  let openBatch: OpenBatch | null = null;
  /** A change happened inside the running batch: one notification is owed when it ends. */
  let held = false;

  const inRange = (row: number, col: number): boolean =>
    Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < rows.length && col >= 0 && col < cols;

  /** Call after every change to `ids` (or its order) so the cached answers are recomputed. */
  const idsChanged = (): void => {
    structureDiffers = null;
    idIndex = null;
  };

  /** Fresh ids for the current rows; ids restart at 0..n-1 and every row counts as original. */
  const restartIds = (): void => {
    ids = sequentialIds(rows.length);
    nextRowId = rows.length;
    newRowLimit = rows.length;
    idsChanged();
  };

  /** Index of the row with this id, or -1. `lookups` says how many lookups are coming. */
  const findRow = (id: number, lookups: number): number => {
    if (idIndex === null) {
      if (lookups <= SMALL_LOOKUP) return ids.indexOf(id);
      idIndex = new Map();
      for (let i = 0; i < ids.length; i++) idIndex.set(ids[i], i);
    }
    const index = idIndex.get(id);
    return index === undefined ? -1 : index;
  };

  const structureChanged = (): boolean => {
    if (structureDiffers === null) {
      let differs = ids.length !== newRowLimit;
      for (let i = 0; !differs && i < ids.length; i++) differs = ids[i] !== i;
      structureDiffers = differs;
    }
    return structureDiffers;
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

  /** Moves rows one place; `selected` is ascending and unique. The caller checked the edges. */
  const moveSelected = (selected: readonly number[], delta: -1 | 1): void => {
    if (delta === -1) {
      // Ascending: a contiguous block moves as a unit, each row hops over the one above it.
      for (const r of selected) swapRows(r - 1, r);
    } else {
      for (let i = selected.length - 1; i >= 0; i--) swapRows(selected[i], selected[i] + 1);
    }
    idsChanged();
  };

  /** Removes the rows at these ascending, unique positions. */
  const removePositions = (positions: readonly number[]): void => {
    const keptRows: string[][] = [];
    const keptIds: number[] = [];
    let next = 0;
    for (let r = 0; r < rows.length; r++) {
      if (next < positions.length && positions[next] === r) {
        next += 1;
      } else {
        keptRows.push(rows[r]);
        keptIds.push(ids[r]);
      }
    }
    rows = keptRows;
    ids = keptIds;
    idsChanged();
  };

  /** Takes the edit tracking of the rows that are about to go. Returns what was taken, so an undo can put it back. */
  const dropEdits = (removedIds: readonly number[]): Array<[string, string]> => {
    const dropped: Array<[string, string]> = [];
    if (edits.size === 0) return dropped;
    const gone = new Set(removedIds);
    // Walk the sparse edits, not every cell of every removed row.
    for (const [key, original] of edits) {
      if (gone.has(Number(key.slice(0, key.indexOf(':'))))) dropped.push([key, original]);
    }
    for (const [key] of dropped) edits.delete(key);
    return dropped;
  };

  /**
   * Writes one existing cell with edit tracking and no notification. True when the value
   * changed. A recorder, when given, gets the write for the journal.
   */
  const writeCell = (row: number, col: number, value: string, recorder?: CellsEntry): boolean => {
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
    if (recorder) {
      recorder.rowIds.push(id);
      recorder.cols.push(col);
      recorder.before.push(current);
      recorder.after.push(value);
    }
    return true;
  };

  const newCellsEntry = (): CellsEntry => ({ kind: 'cells', rowIds: [], cols: [], before: [], after: [] });

  const emit = (): void => {
    versionNumber += 1;
    const snapshot = listeners.slice();
    for (const entry of snapshot) {
      if (entry.active) entry.fn();
    }
  };

  /** Notifies now, or when the running batch ends. */
  const notify = (): void => {
    if (openBatch) held = true;
    else emit();
  };

  // ---- journal: cost, labels, recording ----

  const entryCost = (entry: JournalEntry): number => {
    switch (entry.kind) {
      case 'cells':
        return entry.rowIds.length;
      case 'insert':
      case 'delete':
        return entry.ids.length * cols;
      case 'move':
        return entry.indexes.length;
      default: {
        let sum = 0;
        for (const child of entry.children) sum += entryCost(child);
        return sum;
      }
    }
  };

  /** Label for a batch that was not given one. */
  const describeEntry = (entry: JournalEntry): string => {
    switch (entry.kind) {
      case 'cells': {
        const distinct = new Set<number>();
        for (let i = 0; i < entry.rowIds.length; i++) distinct.add(entry.rowIds[i] * cols + entry.cols[i]);
        return cellsLabel(distinct.size);
      }
      case 'insert':
        return rowsLabel('Insert', entry.ids.length);
      case 'delete':
        return rowsLabel('Delete', entry.ids.length);
      case 'move':
        return rowsLabel('Move', entry.indexes.length);
      default:
        return `Make ${formatCount(entry.children.length)} changes`;
    }
  };

  const dropRedo = (): void => {
    for (const step of redoStack) storedCells -= step.cost;
    redoStack.length = 0;
  };

  /** Puts a finished step on the undo stack, clears redo, and trims the oldest steps past the caps. */
  const pushStep = (entry: JournalEntry, label: string): void => {
    dropRedo();
    const cost = entryCost(entry);
    undoStack.push({ entry, label, cost });
    storedCells += cost;
    // The newest step always stays, so the last change can be undone even when one batch alone is huge.
    let drop = 0;
    while (
      undoStack.length - drop > 1 &&
      (undoStack.length - drop > CRT_MAX_HISTORY_ENTRIES || storedCells > CRT_MAX_HISTORY_CELLS)
    ) {
      storedCells -= undoStack[drop].cost;
      drop += 1;
    }
    if (drop > 0) undoStack.splice(0, drop);
  };

  /** Adds an entry to a running batch. Writes that follow each other join one cells entry. */
  const addChild = (children: JournalEntry[], entry: JournalEntry): void => {
    const last = children[children.length - 1];
    if (entry.kind === 'cells' && last !== undefined && last.kind === 'cells') {
      for (let i = 0; i < entry.rowIds.length; i++) {
        last.rowIds.push(entry.rowIds[i]);
        last.cols.push(entry.cols[i]);
        last.before.push(entry.before[i]);
        last.after.push(entry.after[i]);
      }
    } else {
      children.push(entry);
    }
  };

  /**
   * Records the entries of one change, in the order they were applied. Outside a batch they
   * become a step (a group when there are several) and listeners are told; inside a batch
   * they wait for the batch to end.
   */
  const journal = (entries: JournalEntry[], label: string): void => {
    if (entries.length === 0) return;
    if (openBatch) {
      for (const entry of entries) addChild(openBatch.children, entry);
      held = true;
      return;
    }
    pushStep(entries.length === 1 ? entries[0] : { kind: 'group', children: entries }, label);
    emit();
  };

  const finishBatch = (finished: OpenBatch): void => {
    const children = finished.children;
    if (children.length > 0) {
      const entry: JournalEntry = children.length === 1 ? children[0] : { kind: 'group', children };
      pushStep(entry, finished.label || describeEntry(entry));
    }
    if (held) {
      held = false;
      emit();
    }
  };

  const clearHistory = (): void => {
    undoStack.length = 0;
    redoStack.length = 0;
    storedCells = 0;
    // What a running batch recorded so far belongs to rows that no longer exist.
    if (openBatch) openBatch.children.length = 0;
  };

  // ---- journal: undo and redo ----

  const touchRows = (touched: Touched, rowIds: readonly number[]): void => {
    for (const id of rowIds) touched.ids.push(id);
    touched.c0 = 0;
    touched.c1 = lastCol;
  };

  /** After rows were removed: the row now sitting where they were, clamped. None in an empty table. */
  const touchAnchor = (touched: Touched, index: number): void => {
    if (rows.length === 0) return;
    const id = ids[Math.min(index, rows.length - 1)];
    if (touched.ids[touched.ids.length - 1] !== id) touched.ids.push(id);
    touched.c0 = 0;
    touched.c1 = lastCol;
  };

  const applyCells = (entry: CellsEntry, undoing: boolean, touched: Touched): void => {
    const count = entry.rowIds.length;
    const values = undoing ? entry.before : entry.after;
    let lastId = -1;
    for (let k = 0; k < count; k++) {
      // Undo walks backwards, so a cell written twice ends on its oldest value.
      const i = undoing ? count - 1 - k : k;
      const id = entry.rowIds[i];
      const row = findRow(id, count);
      if (row < 0) continue;
      const col = entry.cols[i];
      writeCell(row, col, values[i]);
      if (id !== lastId) {
        touched.ids.push(id);
        lastId = id;
      }
      if (col < touched.c0) touched.c0 = col;
      if (col > touched.c1) touched.c1 = col;
    }
  };

  const reinsertRun = (entry: InsertEntry, touched: Touched): void => {
    // concat instead of splice(at, 0, ...rows): no argument limit for large inserts.
    rows = rows.slice(0, entry.at).concat(entry.rows, rows.slice(entry.at));
    ids = ids.slice(0, entry.at).concat(entry.ids, ids.slice(entry.at));
    idsChanged();
    touchRows(touched, entry.ids);
  };

  const removeRun = (entry: InsertEntry, touched: Touched): void => {
    rows.splice(entry.at, entry.ids.length);
    ids.splice(entry.at, entry.ids.length);
    idsChanged();
    touchAnchor(touched, entry.at);
  };

  const restoreRows = (entry: DeleteEntry, touched: Touched): void => {
    const total = rows.length + entry.ids.length;
    const mergedRows = new Array<string[]>(total);
    const mergedIds = new Array<number>(total);
    let back = 0;
    let kept = 0;
    for (let i = 0; i < total; i++) {
      if (back < entry.positions.length && entry.positions[back] === i) {
        mergedRows[i] = entry.rows[back];
        mergedIds[i] = entry.ids[back];
        back += 1;
      } else {
        mergedRows[i] = rows[kept];
        mergedIds[i] = ids[kept];
        kept += 1;
      }
    }
    rows = mergedRows;
    ids = mergedIds;
    idsChanged();
    for (const [key, original] of entry.dropped) edits.set(key, original);
    touchRows(touched, entry.ids);
  };

  const removeAgain = (entry: DeleteEntry, touched: Touched): void => {
    for (const [key] of entry.dropped) edits.delete(key);
    removePositions(entry.positions);
    // Row positions[i] was followed by the row that now sits at positions[i] - i.
    for (let i = 0; i < entry.positions.length; i++) touchAnchor(touched, entry.positions[i] - i);
  };

  const applyMove = (entry: MoveEntry, undoing: boolean, touched: Touched): void => {
    const shift = undoing ? -entry.delta : entry.delta;
    // The recorded indexes are where the rows ended up after the original move.
    const from = undoing ? entry.indexes : entry.indexes.map((r) => r - entry.delta);
    moveSelected(from, shift as -1 | 1);
    touchRows(
      touched,
      from.map((r) => ids[r + shift]),
    );
  };

  /** Applies the inverse of an entry (undoing) or the entry itself (redoing). */
  const applyEntry = (entry: JournalEntry, undoing: boolean, touched: Touched): void => {
    switch (entry.kind) {
      case 'cells':
        applyCells(entry, undoing, touched);
        break;
      case 'insert':
        if (undoing) removeRun(entry, touched);
        else reinsertRun(entry, touched);
        break;
      case 'delete':
        if (undoing) restoreRows(entry, touched);
        else removeAgain(entry, touched);
        break;
      case 'move':
        applyMove(entry, undoing, touched);
        break;
      default:
        if (undoing) {
          for (let i = entry.children.length - 1; i >= 0; i--) applyEntry(entry.children[i], true, touched);
        } else {
          for (const child of entry.children) applyEntry(child, false, touched);
        }
    }
  };

  /** Bounding box of what was touched, in the row indexes the table has after the whole step. */
  const resolveRegion = (touched: Touched): CrtRange | null => {
    if (rows.length === 0 || touched.ids.length === 0) return null;
    let r0 = Number.POSITIVE_INFINITY;
    let r1 = -1;
    for (const id of touched.ids) {
      const row = findRow(id, touched.ids.length);
      if (row < 0) continue;
      if (row < r0) r0 = row;
      if (row > r1) r1 = row;
    }
    if (r1 < 0) return null;
    return { r0, c0: touched.c0, r1, c1: touched.c1 };
  };

  const stepThrough = (from: JournalStep[], to: JournalStep[], undoing: boolean): CrtHistoryResult | null => {
    if (!overridden || openBatch !== null) return null;
    const step = from.pop();
    if (step === undefined) return null;
    const touched: Touched = { ids: [], c0: cols, c1: -1 };
    applyEntry(step.entry, undoing, touched);
    to.push(step);
    const region = resolveRegion(touched);
    emit();
    return { label: step.label, region };
  };

  const historyReady = (): boolean => overridden && openBatch === null;

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
      const recorder = newCellsEntry();
      if (!writeCell(row, col, value, recorder)) return false;
      journal([recorder], cellsLabel(1));
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
      idsChanged();
      journal([{ kind: 'insert', at, ids: freshIds, rows: fresh }], rowsLabel('Insert', fresh.length));
      return at;
    },

    deleteRows(indexes) {
      if (!overridden) return 0;
      const doomed = normalizeIndexes(indexes);
      if (doomed.length === 0) return 0;
      const removedRows = doomed.map((r) => rows[r]);
      const removedIds = doomed.map((r) => ids[r]);
      const dropped = dropEdits(removedIds);
      removePositions(doomed);
      journal(
        [{ kind: 'delete', positions: doomed, ids: removedIds, rows: removedRows, dropped }],
        rowsLabel('Delete', doomed.length),
      );
      return doomed.length;
    },

    moveRows(indexes, delta) {
      if (!overridden || (delta !== -1 && delta !== 1)) return [];
      const selected = normalizeIndexes(indexes);
      if (selected.length === 0) return [];
      if (delta === -1) {
        if (selected[0] === 0) return [];
      } else if (selected[selected.length - 1] === rows.length - 1) {
        return [];
      }
      moveSelected(selected, delta);
      const moved = selected.map((r) => r + delta);
      journal([{ kind: 'move', indexes: moved, delta }], rowsLabel('Move', moved.length));
      return moved.slice();
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
      const recorder = newCellsEntry();
      let changed = 0;
      for (let i = 0; i < existing; i++) {
        const line = matrix[i];
        const limit = Math.min(line.length, width);
        for (let j = 0; j < limit; j++) {
          if (writeCell(row + i, col + j, line[j], recorder)) changed += 1;
        }
      }
      // Appended rows start blank, so a cell counts as changed when it is not ''.
      const appendAt = rows.length;
      const appendedIds: number[] = [];
      const appendedRows: string[][] = [];
      for (let i = existing; i < written; i++) {
        const line = matrix[i];
        const limit = Math.min(line.length, width);
        const fresh = normalizeRow([], cols, false);
        for (let j = 0; j < limit; j++) {
          fresh[col + j] = line[j];
          if (line[j] !== '') changed += 1;
        }
        rows.push(fresh);
        const id = nextRowId++;
        ids.push(id);
        appendedRows.push(fresh);
        appendedIds.push(id);
      }
      const added = written - existing;
      if (added > 0) idsChanged();

      // The written cells and the appended rows are one step. Undo removes the rows first, then
      // the cell edits, because it walks the entries backwards.
      const entries: JournalEntry[] = [];
      if (recorder.rowIds.length > 0) entries.push(recorder);
      if (added > 0) entries.push({ kind: 'insert', at: appendAt, ids: appendedIds, rows: appendedRows });
      journal(entries, changed > 0 ? cellsLabel(changed) : rowsLabel('Insert', added));
      return { changed, added, cutColumns, overflow: false };
    },

    fillCells(r0, c0, r1, c1, value) {
      if (!overridden) return 0;
      if (![r0, c0, r1, c1].every(Number.isInteger)) return 0;
      const top = Math.max(0, Math.min(r0, r1));
      const bottom = Math.min(rows.length - 1, Math.max(r0, r1));
      const left = Math.max(0, Math.min(c0, c1));
      const right = Math.min(cols - 1, Math.max(c0, c1));
      const recorder = newCellsEntry();
      let changed = 0;
      for (let r = top; r <= bottom; r++) {
        for (let c = left; c <= right; c++) {
          if (writeCell(r, c, value, recorder)) changed += 1;
        }
      }
      if (changed > 0) journal([recorder], cellsLabel(changed));
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
      clearHistory();
      notify();
    },

    reset() {
      if (!overridden) return;
      rows = defaultView();
      restartIds();
      edits = new Map();
      overridden = false;
      rowsReplaced = loadedOverridden;
      clearHistory();
      notify();
    },

    isDirty: () => rowsReplaced || edits.size > 0 || structureChanged(),

    rowsSnapshot: () => rows.map((row) => row.slice()),

    changeSummary() {
      let added = 0;
      let kept = 0;
      let reordered = false;
      // Original ids ascend in the original order, so a drop between two of them is a reorder.
      let previous = -1;
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (id >= newRowLimit) {
          added += 1;
        } else {
          kept += 1;
          if (id < previous) reordered = true;
          previous = id;
        }
      }
      const editedRows = new Set<number>();
      for (const key of edits.keys()) editedRows.add(Number(key.slice(0, key.indexOf(':'))));
      return {
        loadedOverridden,
        overridden,
        added,
        edited: editedRows.size,
        removed: newRowLimit - kept,
        reordered,
      };
    },

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

    undo: () => stepThrough(undoStack, redoStack, true),
    redo: () => stepThrough(redoStack, undoStack, false),
    canUndo: () => historyReady() && undoStack.length > 0,
    canRedo: () => historyReady() && redoStack.length > 0,
    undoLabel: () => (historyReady() && undoStack.length > 0 ? undoStack[undoStack.length - 1].label : null),
    redoLabel: () => (historyReady() && redoStack.length > 0 ? redoStack[redoStack.length - 1].label : null),

    batch<T>(fn: () => T, label?: string): T {
      // A nested batch joins the outermost one, which keeps its label.
      if (openBatch !== null) return fn();
      const mine: OpenBatch = { children: [], label };
      openBatch = mine;
      try {
        return fn();
      } finally {
        openBatch = null;
        finishBatch(mine);
      }
    },
  };
}
