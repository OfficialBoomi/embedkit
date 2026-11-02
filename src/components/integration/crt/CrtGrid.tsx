/**
 * @file CrtGrid.tsx
 * @component CrtGrid
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * An Excel-like editable grid for one cross reference table. Rows are virtualized
 * (up to 10,000), every column renders (at most 20). The row number gutter and the
 * first data column are frozen. The grid owns only view state (active cell, cell range,
 * ticked rows, open editor, open menu); the data lives in the store, and every keyboard
 * decision comes from the pure rules in crtKeymap.
 *
 * Selection model: `active` is the cell with the outline (the one Enter edits), `anchor`
 * and `focus` are the two corners of the cell range, `checked` are the rows ticked in the
 * gutter. Every row operation runs through one `run(op)` function that the toolbar, the
 * context menu and the keyboard all share, and that the parent reaches through the ref.
 *
 * Keys and clipboard events are stopped here on purpose: inside a shadow root only text
 * inputs are shielded from host page hotkeys, a div grid has to stop what it handles.
 *
 * @return {JSX.Element} The rendered grid.
 */

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
  type Rect,
  type Virtualizer,
} from '@tanstack/react-virtual';
import {
  AiOutlineArrowDown,
  AiOutlineArrowUp,
  AiOutlineClear,
  AiOutlineCopy,
  AiOutlineDelete,
  AiOutlineDiff,
  AiOutlineInsertRowAbove,
  AiOutlineInsertRowBelow,
  AiOutlinePlus,
  AiOutlineScissor,
  AiOutlineSnippets,
  AiOutlineVerticalAlignBottom,
  AiOutlineVerticalAlignTop,
} from 'react-icons/ai';
import { CRT_MAX_ROWS, type CrtStore } from '../../../utils/crt/crtStore';
import type { CrtCell } from '../../../utils/crt/crtTypes';
import { resolveEditKey, resolveNavKey, type NavContext } from '../../../utils/crt/crtKeymap';
import {
  clampCell,
  describeSelection,
  indexesBetween,
  inRange,
  normalizeRange,
  rangeCols,
  rangeRows,
  targetRows,
  toggleIndex,
  wholeGrid,
  type CrtRange,
} from '../../../utils/crt/crtSelection';
import { fitColumns, parseClipboard, readMatrix, toTsv } from '../../../utils/crt/crtClipboard';
import CrtMenu, { type CrtMenuItem } from './CrtMenu';
import { isOpEnabled, MAX_ROWS_MESSAGE } from './CrtToolbar';

/** Pixel sizes. The CSS reads the same values through custom properties on the root. */
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 32;
/** Room for the row checkbox and a five digit row number. Keep in step with the CSS fallback. */
const GUTTER_WIDTH = 88;
const OVERSCAN = 12;

const MIN_COL_WIDTH = 96;
const MAX_COL_WIDTH = 320;
const DEFAULT_COL_WIDTH = 160;
const CHAR_WIDTH = 8;
const CELL_PADDING = 24;
/** Rows read to size the columns. Enough to be representative, cheap on 10,000 rows. */
const SAMPLE_ROWS = 100;
/** Longer text gets a native tooltip, since it is probably clipped. */
const TITLE_MIN_LENGTH = 24;
/** How long a "paste with the keyboard next" request stays armed. */
const PENDING_PASTE_MS = 10000;

const ORIGIN: CrtCell = { row: 0, col: 0 };

const ROOT_STYLE = {
  '--crt-row-h': `${ROW_HEIGHT}px`,
  '--crt-header-h': `${HEADER_HEIGHT}px`,
  '--crt-gutter-w': `${GUTTER_WIDTH}px`,
} as React.CSSProperties;

const CUT_COLUMNS_MESSAGE = 'Some columns did not fit and were skipped.';
const PASTE_HINT_MESSAGE = 'Press Ctrl+V to paste';
const clipboardBlockedMessage = (key: string): string =>
  `Your browser blocked clipboard access. Click the grid and press Ctrl+${key}.`;

/** Everything the grid can do to a table, for the toolbar, the menu and the keyboard alike. */
export type CrtOp =
  | 'add-row'
  | 'insert-above'
  | 'insert-below'
  | 'duplicate'
  | 'delete'
  | 'move-up'
  | 'move-down'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'paste-above'
  | 'paste-below'
  | 'clear'
  | 'select-all';

/** The imperative surface the screen uses: the toolbar runs operations through it. */
export interface CrtGridHandle {
  run(op: CrtOp): void;
  focus(): void;
}

/** What the toolbar needs to know about the grid. Reported whenever any of it may have changed. */
export interface CrtGridInfo {
  selectionLabel: string;
  canEdit: boolean;
  hasRows: boolean;
  checkedCount: number;
  targetCount: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  atMaxRows: boolean;
  rowCount: number;
}

type NoticeKind = 'info' | 'warn';
type PasteMode = 'paste' | 'above' | 'below';
type EditMode = 'select-all' | 'append' | 'replace';
type CommitMove = 'down' | 'up' | 'right' | 'left';

/** The open cell editor. It remembers its store so a stale editor can never write to another table. */
interface EditState {
  store: CrtStore;
  row: number;
  col: number;
  mode: EditMode;
  initial: string;
}

/** `value` null means cancel. `refocus` is false when focus is already going elsewhere (blur). */
type FinishEdit = (value: string | null, move: CommitMove | null, refocus: boolean) => void;

interface GridLayout {
  widths: number[];
  /** Left edge of each column in canvas coordinates (the gutter comes first). */
  lefts: number[];
  total: number;
  /** One shared style object per column, so cells do not allocate one each render. */
  styles: React.CSSProperties[];
  rowStyle: React.CSSProperties;
}

/** The whole selection, kept in one object so it always changes atomically. */
interface GridSelection {
  active: CrtCell;
  anchor: CrtCell;
  focus: CrtCell;
  /** Ticked rows, ascending and unique. Never mutated; always replaced. */
  checked: number[];
  /** The row a Shift+click on a gutter checkbox extends from. */
  rowAnchor: number;
}

const NO_ROWS: number[] = [];
const INITIAL_SELECTION: GridSelection = {
  active: ORIGIN,
  anchor: ORIGIN,
  focus: ORIGIN,
  checked: NO_ROWS,
  rowAnchor: 0,
};

/** One cell is active and nothing else is selected. */
const plainSelection = (cell: CrtCell, rowAnchor: number): GridSelection => ({
  active: cell,
  anchor: cell,
  focus: cell,
  checked: NO_ROWS,
  rowAnchor,
});

const cellInside = (c: CrtCell, rows: number, cols: number): boolean =>
  c.row >= 0 && c.row < rows && c.col >= 0 && c.col < cols;

/**
 * Pulls a selection back inside the grid after rows were removed behind it. Returns the same
 * object when nothing is out of range, so memoized readers stay stable.
 */
function clampSelection(s: GridSelection, rows: number, cols: number): GridSelection {
  if (rows <= 0 || cols <= 0) return INITIAL_SELECTION;
  const checkedOk = s.checked.length === 0 || s.checked[s.checked.length - 1] < rows;
  if (
    checkedOk &&
    s.rowAnchor < rows &&
    cellInside(s.active, rows, cols) &&
    cellInside(s.anchor, rows, cols) &&
    cellInside(s.focus, rows, cols)
  ) {
    return s;
  }
  return {
    active: clampCell(s.active, rows, cols),
    anchor: clampCell(s.anchor, rows, cols),
    focus: clampCell(s.focus, rows, cols),
    checked: checkedOk ? s.checked : s.checked.filter((i) => i < rows),
    rowAnchor: Math.min(s.rowAnchor, rows - 1),
  };
}

const selectionRange = (s: GridSelection): CrtRange => normalizeRange(s.anchor, s.focus);
const isMultiCell = (r: CrtRange): boolean => r.r0 !== r.r1 || r.c0 !== r.c1;
const hasAnySelection = (s: GridSelection): boolean =>
  s.checked.length > 0 || isMultiCell(selectionRange(s));

/** Splits an ascending list of rows into runs of consecutive rows, as [first, last] pairs. */
function contiguousRuns(sorted: readonly number[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  for (const index of sorted) {
    const last = runs[runs.length - 1];
    if (last && index === last[1] + 1) last[1] = index;
    else runs.push([index, index]);
  }
  return runs;
}

const plural = (n: number, one: string): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : `${one}s`}`;

const isMac = (): boolean =>
  typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || '');

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

/** After a commit the cell moves like the matching navigation key would. */
const COMMIT_KEYS: Record<CommitMove, { key: string; shiftKey?: boolean }> = {
  down: { key: 'ArrowDown' },
  up: { key: 'ArrowUp' },
  right: { key: 'Tab' },
  left: { key: 'Tab', shiftKey: true },
};

/** Widths come from the header and a sample of the first rows, computed once per store. */
function computeLayout(store: CrtStore): GridLayout {
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
function scrollColumnIntoView(el: HTMLElement, layout: GridLayout, col: number): void {
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
function scrollRowIntoView(el: HTMLElement, row: number): void {
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
function observeGridRect(
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

const estimateRowSize = (): number => ROW_HEIGHT;

/** Precomputed class strings: bit 1 frozen, 2 active, 4 edited, 8 editing, 16 in the cell range. */
const CELL_CLASS: string[] = [];
for (let flags = 0; flags < 32; flags++) {
  CELL_CLASS.push(
    [
      'boomi-crt-cell',
      flags & 1 ? 'boomi-crt-cell--frozen' : '',
      flags & 2 ? 'boomi-crt-cell--active' : '',
      flags & 4 ? 'boomi-crt-cell--edited' : '',
      flags & 8 ? 'boomi-crt-cell--editing' : '',
      flags & 16 ? 'boomi-crt-cell--selected' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}

/**
 * Row classes. Striping follows the displayed row number (row 1 is odd), not the DOM
 * position. Index: bit 1 even, bit 2 ticked, bit 4 new.
 */
const ROW_CLASS: string[] = [];
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
const GUTTER_CLASS: string[] = [];
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

const CHECK = 'boomi-crt-check';
const CHECK_ON = 'boomi-crt-check boomi-crt-check--on';
const CHECK_MIXED = 'boomi-crt-check boomi-crt-check--mixed';

interface CellEditorProps {
  edit: EditState;
  onFinish: FinishEdit;
}

/** Uncontrolled text input for the active cell. Finishes exactly once. */
const CellEditor: React.FC<CellEditorProps> = ({ edit, onFinish }) => {
  const done = useRef(false);
  const { mode, initial } = edit;

  const setup = useCallback(
    (el: HTMLInputElement | null) => {
      if (!el) return;
      // The grid positions the scroll itself; do not let focus jump it.
      el.focus({ preventScroll: true });
      if (mode === 'select-all') {
        el.select();
      } else {
        const end = el.value.length;
        el.setSelectionRange(end, end);
      }
    },
    [mode]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter while an input method is composing text confirms the composition, not the cell.
    if (e.nativeEvent.isComposing) return;
    const action = resolveEditKey(e);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    if (done.current) return;
    done.current = true;
    if (action.type === 'commit') {
      onFinish(e.currentTarget.value, action.move, true);
    } else {
      onFinish(null, null, true);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (done.current) return;
    done.current = true;
    onFinish(e.currentTarget.value, null, false);
  };

  return (
    <input
      ref={setup}
      type="text"
      name="crt-cell"
      className="boomi-crt-cell-input boomi-input"
      defaultValue={initial}
      aria-label={`Edit ${edit.store.columns[edit.col] ?? 'cell'}, row ${edit.row + 1}`}
      autoComplete="off"
      spellCheck={false}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    />
  );
};

interface GridRowProps {
  store: CrtStore;
  layout: GridLayout;
  row: number;
  top: number;
  /** Active column when this is the active row, otherwise -1. */
  activeCol: number;
  activeId: string;
  /** The open editor when it is in this row, otherwise null. */
  edit: EditState | null;
  hasEdits: boolean;
  /** Not read: a changed version defeats the memo so rows redraw after a store change. */
  version: number;
  onFinishEdit: FinishEdit;
  /** The row is ticked in the gutter. */
  rowChecked: boolean;
  /** First and last column of the cell range in this row, or -1 when the row is outside it. */
  selC0: number;
  selC1: number;
  /** The row was inserted or appended since the table was loaded. */
  rowNew: boolean;
}

/** Memoized (primitive props only) so moving the active cell redraws two rows, not the whole window. */
const GridRow = memo(function GridRow({
  store,
  layout,
  row,
  top,
  activeCol,
  activeId,
  edit,
  hasEdits,
  onFinishEdit,
  rowChecked,
  selC0,
  selC1,
  rowNew,
}: GridRowProps) {
  const cells: React.ReactNode[] = [];
  const cols = layout.widths.length;
  for (let c = 0; c < cols; c++) {
    const text = store.getCell(row, c);
    const isActive = c === activeCol;
    const editing = edit !== null && edit.col === c;
    const inSelection = c >= selC0 && c <= selC1;
    const flags =
      (c === 0 ? 1 : 0) |
      (isActive ? 2 : 0) |
      (hasEdits && store.isCellEdited(row, c) ? 4 : 0) |
      (editing ? 8 : 0) |
      (inSelection && !isActive ? 16 : 0);
    cells.push(
      <div
        key={c}
        role="gridcell"
        id={isActive ? activeId : undefined}
        aria-colindex={c + 2}
        aria-selected={isActive || inSelection || rowChecked}
        className={CELL_CLASS[flags]}
        style={layout.styles[c]}
        data-c={c}
        title={!editing && text.length > TITLE_MIN_LENGTH ? text : undefined}
      >
        {editing ? <CellEditor edit={edit} onFinish={onFinishEdit} /> : text}
      </div>
    );
  }
  return (
    <div
      role="row"
      aria-rowindex={row + 2}
      aria-selected={rowChecked || undefined}
      data-r={row}
      className={ROW_CLASS[(row % 2) | (rowChecked ? 2 : 0) | (rowNew ? 4 : 0)]}
      style={{ top, width: layout.total }}
    >
      <div
        role="rowheader"
        aria-colindex={1}
        data-gutter=""
        className={GUTTER_CLASS[(activeCol >= 0 ? 1 : 0) | (rowNew ? 2 : 0)]}
        title={rowNew ? 'New row' : undefined}
      >
        <span
          role="checkbox"
          aria-checked={rowChecked}
          aria-label={`Select row ${row + 1}`}
          data-check=""
          className={rowChecked ? CHECK_ON : CHECK}
        />
        <span className="boomi-crt-rownum">{row + 1}</span>
      </div>
      {cells}
    </div>
  );
});

/**
 * @interface CrtGridProps
 *
 * @description
 * Props for the `CrtGrid` component.
 *
 * @property {CrtStore} store - The table data and its edit state.
 * @property {string} ariaLabel - Accessible name of the grid.
 * @property {() => void} [onBlocked] - Called when the user tries to edit a read only table.
 * @property {(info: CrtGridInfo) => void} [onInfo] - Called after render whenever the selection or the table changed.
 * @property {(message: string, kind: 'info' | 'warn') => void} [onNotice] - Short result messages ("Pasted 3 rows").
 * @property {(rowCount: number) => Promise<boolean>} [confirmDelete] - Asked before deleting two or more rows.
 */
export interface CrtGridProps {
  store: CrtStore;
  ariaLabel: string;
  onBlocked?: () => void;
  onInfo?: (info: CrtGridInfo) => void;
  onNotice?: (message: string, kind: NoticeKind) => void;
  confirmDelete?: (rowCount: number) => Promise<boolean>;
}

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

/** Reads the cell address of a mouse event from the data attributes, or null off the cells. */
function cellFromEvent(e: React.MouseEvent<HTMLElement>): CrtCell | null {
  const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-c]');
  const rowEl = cell?.parentElement;
  if (!cell || !rowEl || rowEl.dataset.r === undefined) return null;
  const row = Number(rowEl.dataset.r);
  const col = Number(cell.dataset.c);
  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null;
}

/** The row of the gutter cell under a mouse event, or null when the event is not on a gutter. */
function gutterRowFromEvent(e: React.MouseEvent<HTMLElement>): number | null {
  const gutter = (e.target as HTMLElement).closest<HTMLElement>('[data-gutter]');
  const rowEl = gutter?.parentElement;
  if (!gutter || !rowEl || rowEl.dataset.r === undefined) return null;
  const row = Number(rowEl.dataset.r);
  return Number.isInteger(row) ? row : null;
}

const CrtGrid = forwardRef<CrtGridHandle, CrtGridProps>(function CrtGrid(
  { store, ariaLabel, onBlocked, onInfo, onNotice, confirmDelete },
  handleRef
) {
  const version = useSyncExternalStore(store.subscribe, store.version);
  const boxRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeId = `${useId()}-active`;
  const [sel, setSel] = useState<GridSelection>(INITIAL_SELECTION);
  // Mirrors `sel` for handlers that run between renders (mouse move, async operations).
  const selRef = useRef<GridSelection>(INITIAL_SELECTION);
  const [edit, setEdit] = useState<EditState | null>(null);
  // Mirrors `edit` for handlers and the range extractor, which must not go stale.
  const editRef = useRef<EditState | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuOpenRef = useRef(false);
  // The scroll position when the menu opened: a scroll event that merely reports it is not a scroll.
  const menuScrollRef = useRef<{ top: number; left: number } | null>(null);
  const draggingRef = useRef(false);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const pendingPasteRef = useRef<{ mode: PasteMode; timer: ReturnType<typeof setTimeout> } | null>(
    null
  );
  // A scroll that has to wait for the next render, because the table just got taller.
  const scrollTargetRef = useRef<{ row: number; col: number } | null>(null);
  const deleteBusyRef = useRef(false);
  const storeRef = useRef(store);
  const callbacksRef = useRef({ onBlocked, onNotice, confirmDelete });
  const runRef = useRef<(op: CrtOp) => void>(() => {});

  useEffect(() => {
    storeRef.current = store;
    callbacksRef.current = { onBlocked, onNotice, confirmDelete };
  });

  const rowCount = store.rowCount();
  const colCount = store.colCount();
  const editable = store.isEditable();
  const layout = useMemo(() => computeLayout(store), [store]);

  const applySel = useCallback((next: GridSelection) => {
    selRef.current = next;
    setSel(next);
  }, []);

  const getSel = (): GridSelection =>
    clampSelection(selRef.current, store.rowCount(), store.colCount());

  const cur = useMemo(
    () => clampSelection(sel, rowCount, colCount),
    [sel, rowCount, colCount]
  );

  // Keep the row being edited mounted while the user scrolls, or its text would be lost.
  const rangeExtractor = useCallback((range: Range): number[] => {
    const indexes = defaultRangeExtractor(range);
    const keep = editRef.current?.row ?? -1;
    if (keep < 0 || keep >= range.count || indexes.length === 0) return indexes;
    if (keep < indexes[0]) return [keep, ...indexes];
    if (keep > indexes[indexes.length - 1]) return [...indexes, keep];
    return indexes;
  }, []);

  const getScrollElement = useCallback(() => rootRef.current, []);

  const virtualizer = useVirtualizer<HTMLDivElement, Element>({
    count: rowCount,
    getScrollElement,
    estimateSize: estimateRowSize,
    overscan: OVERSCAN,
    // The sticky header sits above the first row, so rows start one header down.
    scrollMargin: HEADER_HEIGHT,
    observeElementRect: observeGridRect,
    rangeExtractor,
  });

  const focusRoot = useCallback(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const closeMenu = useCallback(
    (refocus: boolean) => {
      if (menuOpenRef.current) {
        menuOpenRef.current = false;
        setMenu(null);
      }
      if (refocus) focusRoot();
    },
    [focusRoot]
  );

  const clearPending = useCallback(() => {
    const pending = pendingPasteRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingPasteRef.current = null;
  }, []);

  const endDrag = useCallback(() => {
    draggingRef.current = false;
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
  }, []);

  // A new table starts from the top left with nothing open or selected.
  useEffect(() => {
    editRef.current = null;
    setEdit(null);
    applySel(INITIAL_SELECTION);
    closeMenu(false);
    clearPending();
    endDrag();
    const el = rootRef.current;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }, [store, applySel, closeMenu, clearPending, endDrag]);

  // Override and Reset swap the rows under the selection. Drop an open editor when the table
  // turns read only, and collapse the selection (cell range and ticked rows) either way.
  useEffect(() => {
    if (!editable) {
      editRef.current = null;
      setEdit(null);
    }
    const s = selRef.current;
    if (!editable) {
      // Reset: the rows are the defaults again, so start from the top left like a newly opened table.
      applySel(INITIAL_SELECTION);
      if (rootRef.current) rootRef.current.scrollTop = 0;
    } else if (s.checked.length > 0 || s.anchor !== s.active || s.focus !== s.active) {
      applySel({ active: s.active, anchor: s.active, focus: s.active, checked: NO_ROWS, rowAnchor: s.rowAnchor });
    }
    closeMenu(false);
    clearPending();
  }, [editable, applySel, closeMenu, clearPending]);

  // Timers and document listeners must not outlive the grid.
  useEffect(
    () => () => {
      clearPending();
      endDrag();
    },
    [clearPending, endDrag]
  );

  // A scroll that had to wait for new rows to be laid out (add row, insert, paste, move).
  useLayoutEffect(() => {
    const target = scrollTargetRef.current;
    if (!target) return;
    scrollTargetRef.current = null;
    const el = rootRef.current;
    if (!el) return;
    scrollRowIntoView(el, target.row);
    scrollColumnIntoView(el, layout, target.col);
  });

  const navContext = (row: number, col: number, hasSelection: boolean): NavContext => {
    const el = rootRef.current;
    const viewport = el ? el.clientHeight - HEADER_HEIGHT : 0;
    return {
      row,
      col,
      rowCount: store.rowCount(),
      colCount: store.colCount(),
      pageRows: Math.max(1, Math.floor(viewport / ROW_HEIGHT)),
      editable: store.isEditable(),
      hasSelection,
    };
  };

  /** A plain move: one active cell, no range, no ticked rows. Scrolls it into view. */
  const moveTo = useCallback(
    (row: number, col: number) => {
      applySel(plainSelection({ row, col }, row));
      const el = rootRef.current;
      if (!el) return;
      scrollRowIntoView(el, row);
      scrollColumnIntoView(el, layout, col);
    },
    [layout, applySel]
  );

  /** Moves only the `focus` corner of the range (Shift+arrows, Shift+click, drag). */
  const extendTo = (row: number, col: number, scroll: boolean) => {
    const s = getSel();
    if (s.focus.row === row && s.focus.col === col && s.checked.length === 0) return;
    applySel({ ...s, focus: { row, col }, checked: NO_ROWS });
    const el = rootRef.current;
    if (!el || !scroll) return;
    scrollRowIntoView(el, row);
    scrollColumnIntoView(el, layout, col);
  };

  const startEdit = useCallback(
    (row: number, col: number, mode: EditMode, char?: string) => {
      const initial = mode === 'replace' ? (char ?? '') : store.getCell(row, col);
      const next: EditState = { store, row, col, mode, initial };
      editRef.current = next;
      setEdit(next);
    },
    [store]
  );

  const finishEdit = useCallback<FinishEdit>(
    (value, move, refocus) => {
      const current = editRef.current;
      if (!current) return;
      editRef.current = null;
      setEdit(null);
      if (current.store !== store) return;
      if (value !== null) store.setCell(current.row, current.col, value);
      if (move) {
        const next = resolveNavKey(COMMIT_KEYS[move], {
          row: current.row,
          col: current.col,
          rowCount: store.rowCount(),
          colCount: store.colCount(),
          pageRows: 1,
          editable: store.isEditable(),
        });
        if (next && next.type === 'move') moveTo(next.row, next.col);
      }
      if (refocus) rootRef.current?.focus({ preventScroll: true });
    },
    [store, moveTo]
  );

  /**
   * Commits an open cell editor from outside it (a toolbar or menu action), so no stale editor
   * is left open over rows that are about to move. The input is uncontrolled, so its value is
   * read from the DOM.
   */
  const commitEditor = () => {
    if (!editRef.current) return;
    const input = rootRef.current?.querySelector<HTMLInputElement>('input.boomi-crt-cell-input');
    finishEdit(input ? input.value : null, null, false);
  };

  const notice = (message: string, kind: NoticeKind = 'info') => {
    callbacksRef.current.onNotice?.(message, kind);
  };

  // ---------- Selection operations ----------

  /** Selects whole rows first..last, active in the first column of the first row. */
  const selectBlock = (first: number, last: number, scrollRow = first) => {
    const lastCol = Math.max(store.colCount() - 1, 0);
    applySel({
      active: { row: first, col: 0 },
      anchor: { row: first, col: 0 },
      focus: { row: last, col: lastCol },
      checked: NO_ROWS,
      rowAnchor: first,
    });
    scrollTargetRef.current = { row: scrollRow, col: 0 };
  };

  const selectAll = () => {
    const grid = wholeGrid(store.rowCount(), store.colCount());
    if (!grid) return;
    const s = getSel();
    applySel({
      active: s.active,
      anchor: { row: grid.r0, col: grid.c0 },
      focus: { row: grid.r1, col: grid.c1 },
      checked: NO_ROWS,
      rowAnchor: s.rowAnchor,
    });
  };

  /** Shift+Space: the rows of the range (or the active row), across every column. */
  const selectRow = () => {
    const s = getSel();
    const multi = isMultiCell(selectionRange(s));
    const from = multi ? s.anchor.row : s.active.row;
    const to = multi ? s.focus.row : s.active.row;
    applySel({
      active: s.active,
      anchor: { row: from, col: 0 },
      focus: { row: to, col: Math.max(store.colCount() - 1, 0) },
      checked: NO_ROWS,
      rowAnchor: s.rowAnchor,
    });
  };

  const collapse = () => {
    const s = getSel();
    applySel({ active: s.active, anchor: s.active, focus: s.active, checked: NO_ROWS, rowAnchor: s.rowAnchor });
  };

  /** Ticks (or unticks) rows and drops the cell range, so only the ticked rows look selected. */
  const withChecked = (s: GridSelection, checked: number[], rowAnchor: number): GridSelection => ({
    active: s.active,
    anchor: s.active,
    focus: s.active,
    checked,
    rowAnchor,
  });

  /** A click on a row number: only that row, ticked and as the cell range. */
  const selectOnlyRow = (row: number) => {
    const s = getSel();
    const lastCol = Math.max(store.colCount() - 1, 0);
    applySel({
      active: { row, col: Math.min(s.active.col, lastCol) },
      anchor: { row, col: 0 },
      focus: { row, col: lastCol },
      checked: [row],
      rowAnchor: row,
    });
  };

  const toggleAll = () => {
    const rows = store.rowCount();
    if (rows === 0) return;
    const s = getSel();
    const all = s.checked.length === rows;
    applySel(withChecked(s, all ? NO_ROWS : indexesBetween(0, rows - 1), s.rowAnchor));
  };

  /** The rows a row operation applies to. None when the table has no rows. */
  const targetsOf = (s: GridSelection): number[] =>
    store.rowCount() === 0 ? [] : targetRows(s.checked, selectionRange(s), s.active.row);

  const readRow = (row: number): string[] => {
    const out: string[] = [];
    for (let c = 0; c < store.colCount(); c++) out.push(store.getCell(row, c));
    return out;
  };

  const blankRows = (n: number): string[][] =>
    Array.from({ length: n }, () => new Array<string>(store.colCount()).fill(''));

  // ---------- Row operations ----------

  const addRow = () => {
    const index = store.insertRows(store.rowCount(), blankRows(1));
    if (index < 0) {
      notice(MAX_ROWS_MESSAGE, 'warn');
      return;
    }
    selectBlock(index, index);
  };

  const insertBlank = (where: 'above' | 'below') => {
    const t = targetsOf(getSel());
    const n = Math.max(t.length, 1);
    const at = t.length === 0 ? 0 : where === 'above' ? t[0] : t[t.length - 1] + 1;
    const index = store.insertRows(at, blankRows(n));
    if (index < 0) {
      notice(MAX_ROWS_MESSAGE, 'warn');
      return;
    }
    selectBlock(index, index + n - 1);
  };

  const duplicate = () => {
    const t = targetsOf(getSel());
    if (t.length === 0) return;
    const index = store.insertRows(t[t.length - 1] + 1, t.map(readRow));
    if (index < 0) {
      notice(MAX_ROWS_MESSAGE, 'warn');
      return;
    }
    selectBlock(index, index + t.length - 1);
  };

  /** Removes rows and parks the selection on the row that took the first removed row's place. */
  const removeRows = (rows: number[], col: number): number => {
    const removed = store.deleteRows(rows);
    if (removed === 0) return 0;
    const left = store.rowCount();
    if (left === 0) {
      applySel(INITIAL_SELECTION);
    } else {
      const row = Math.min(rows[0], left - 1);
      const c = Math.min(col, store.colCount() - 1);
      applySel(plainSelection({ row, col: c }, row));
      scrollTargetRef.current = { row, col: c };
    }
    return removed;
  };

  const deleteSelected = async () => {
    const s = getSel();
    const t = targetsOf(s);
    if (t.length === 0 || deleteBusyRef.current) return;
    const confirm = callbacksRef.current.confirmDelete;
    // After a dialog the owner of confirmDelete gives focus back once the dialog has finished
    // closing. Taking it here, as the answer arrives, would put focus in the grid while the
    // page is still hidden behind the closing dialog.
    const askedFirst = t.length >= 2 && !!confirm;
    if (askedFirst) {
      deleteBusyRef.current = true;
      let ok = false;
      try {
        ok = await confirm(t.length);
      } finally {
        deleteBusyRef.current = false;
      }
      if (!ok || storeRef.current !== store) return;
    }
    const removed = removeRows(t, s.active.col);
    if (removed > 0) notice(`${plural(removed, 'row')} deleted`);
    if (!askedFirst) focusRoot();
  };

  const moveSelected = (delta: -1 | 1) => {
    const s = getSel();
    const t = targetsOf(s);
    if (t.length === 0) return;
    const moved = store.moveRows(t, delta);
    if (moved.length === 0) {
      notice(delta < 0 ? 'Already at the top' : 'Already at the bottom', 'warn');
      return;
    }
    const first = moved[0];
    const last = moved[moved.length - 1];
    const lastCol = Math.max(store.colCount() - 1, 0);
    const start = { row: first, col: 0 };
    if (s.checked.length > 0) {
      // Ticked rows can be apart, so the moved rows stay ticked and no range spans the gap.
      applySel({ active: start, anchor: start, focus: start, checked: moved, rowAnchor: first });
    } else {
      applySel({
        active: start,
        anchor: start,
        focus: { row: last, col: lastCol },
        checked: NO_ROWS,
        rowAnchor: first,
      });
    }
    scrollTargetRef.current = { row: delta < 0 ? first : last, col: 0 };
  };

  const clearSelected = () => {
    if (store.rowCount() === 0) return;
    const s = getSel();
    if (s.checked.length > 0) {
      const lastCol = store.colCount() - 1;
      for (const [first, last] of contiguousRuns(s.checked)) store.fillCells(first, 0, last, lastCol, '');
      return;
    }
    const r = selectionRange(s);
    if (isMultiCell(r)) store.fillCells(r.r0, r.c0, r.r1, r.c1, '');
    else store.setCell(r.r0, r.c0, '');
  };

  // ---------- Clipboard ----------

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

  // ---------- run(op) ----------

  const runOp = (op: CrtOp) => {
    commitEditor();
    if (op !== 'copy' && op !== 'select-all' && !store.isEditable()) {
      callbacksRef.current.onBlocked?.();
      focusRoot();
      return;
    }
    switch (op) {
      case 'add-row':
        addRow();
        break;
      case 'insert-above':
        insertBlank('above');
        break;
      case 'insert-below':
        insertBlank('below');
        break;
      case 'duplicate':
        duplicate();
        break;
      case 'delete':
        // It may open a confirm dialog and hands focus back itself when done. Taking focus
        // here would put it in the grid under the dialog, and Esc could not close the dialog.
        void deleteSelected();
        return;
      case 'move-up':
        moveSelected(-1);
        break;
      case 'move-down':
        moveSelected(1);
        break;
      case 'cut':
        void copyWithApi(true);
        break;
      case 'copy':
        void copyWithApi(false);
        break;
      case 'paste':
        void pasteWithApi('paste');
        break;
      case 'paste-above':
        void pasteWithApi('above');
        break;
      case 'paste-below':
        void pasteWithApi('below');
        break;
      case 'clear':
        clearSelected();
        break;
      case 'select-all':
        selectAll();
        break;
    }
    focusRoot();
  };

  useEffect(() => {
    runRef.current = runOp;
  });

  useImperativeHandle(
    handleRef,
    () => ({
      run: (op) => runRef.current(op),
      focus: () => rootRef.current?.focus({ preventScroll: true }),
    }),
    []
  );

  // ---------- Information for the toolbar ----------

  const info = useMemo<CrtGridInfo>(() => {
    const range = rowCount > 0 ? selectionRange(cur) : null;
    const t = range ? targetRows(cur.checked, range, cur.active.row) : [];
    return {
      selectionLabel: describeSelection(cur.checked, range, store.columns),
      canEdit: editable,
      hasRows: rowCount > 0,
      checkedCount: cur.checked.length,
      targetCount: t.length,
      canMoveUp: editable && t.length > 0 && t[0] > 0,
      canMoveDown: editable && t.length > 0 && t[t.length - 1] < rowCount - 1,
      atMaxRows: rowCount >= CRT_MAX_ROWS,
      rowCount,
    };
  }, [cur, store, editable, rowCount]);

  useEffect(() => {
    onInfo?.(info);
  }, [info, onInfo]);

  // ---------- Context menu ----------

  const openMenu = (x: number, y: number) => {
    const el = rootRef.current;
    menuScrollRef.current = el ? { top: el.scrollTop, left: el.scrollLeft } : null;
    menuOpenRef.current = true;
    setMenu({ x, y });
  };

  /** The menu coordinates are relative to the wrapper, which shares its origin with the grid root. */
  const openMenuAtPointer = (clientX: number, clientY: number) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    openMenu(clientX - box.left, clientY - box.top);
  };

  /** Keyboard: the menu hangs off the bottom left of the active cell (or the top of an empty table). */
  const openMenuAtActive = () => {
    const el = rootRef.current;
    const box = boxRef.current?.getBoundingClientRect();
    if (!el || !box) return;
    const rect = el.getBoundingClientRect();
    const originX = rect.left - box.left + el.clientLeft;
    const originY = rect.top - box.top + el.clientTop;
    if (store.rowCount() === 0) {
      openMenu(originX + GUTTER_WIDTH, originY + HEADER_HEIGHT);
      return;
    }
    const { active } = getSel();
    scrollRowIntoView(el, active.row);
    scrollColumnIntoView(el, layout, active.col);
    // The first data column is frozen, so it never moves with the horizontal scroll.
    const left = active.col === 0 ? GUTTER_WIDTH : layout.lefts[active.col] - el.scrollLeft;
    const top = HEADER_HEIGHT + active.row * ROW_HEIGHT - el.scrollTop + ROW_HEIGHT;
    openMenu(originX + left + 8, originY + top);
  };

  const menuItems = useMemo<CrtMenuItem[] | null>(() => {
    if (!menu) return null;
    const mod = isMac() ? '⌘' : 'Ctrl+';
    const item = (
      op: CrtOp,
      label: string,
      icon: React.ReactNode,
      extra: { shortcut?: string; danger?: boolean } = {}
    ): CrtMenuItem => ({
      id: op,
      label,
      icon,
      disabled: !isOpEnabled(op, info),
      ...extra,
    });
    const list: CrtMenuItem[] = [];
    if (!info.hasRows) {
      list.push(item('add-row', 'Add row', <AiOutlinePlus className="boomi-menu-icon" />), { divider: true });
    }
    list.push(
      item('cut', 'Cut', <AiOutlineScissor className="boomi-menu-icon" />, { shortcut: `${mod}X` }),
      item('copy', 'Copy', <AiOutlineCopy className="boomi-menu-icon" />, { shortcut: `${mod}C` }),
      item('paste', 'Paste', <AiOutlineSnippets className="boomi-menu-icon" />, { shortcut: `${mod}V` }),
      item('paste-above', 'Paste above', <AiOutlineVerticalAlignTop className="boomi-menu-icon" />),
      item('paste-below', 'Paste below', <AiOutlineVerticalAlignBottom className="boomi-menu-icon" />),
      { divider: true },
      item('insert-above', 'Insert above', <AiOutlineInsertRowAbove className="boomi-menu-icon" />),
      item('insert-below', 'Insert below', <AiOutlineInsertRowBelow className="boomi-menu-icon" />),
      item('duplicate', 'Duplicate', <AiOutlineDiff className="boomi-menu-icon" />),
      item('move-up', 'Move up', <AiOutlineArrowUp className="boomi-menu-icon" />),
      item('move-down', 'Move down', <AiOutlineArrowDown className="boomi-menu-icon" />),
      { divider: true },
      item('clear', 'Clear contents', <AiOutlineClear className="boomi-menu-icon" />),
      item(
        'delete',
        info.targetCount > 1 ? `Delete ${info.targetCount} rows` : 'Delete row',
        <AiOutlineDelete className="boomi-menu-icon" />,
        { danger: true }
      )
    );
    return list;
  }, [menu, info]);

  const handleMenuSelect = (id: string) => {
    closeMenu(true);
    runOp(id as CrtOp);
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    // The cell editor keeps the browser's own text menu.
    if (target.tagName === 'INPUT') return;
    const cell = cellFromEvent(e);
    const gutterRow = gutterRowFromEvent(e);
    // An empty table has no cells, so its whole body (not the header) opens the menu.
    const emptyBody = store.rowCount() === 0 && !target.closest('.boomi-crt-header');
    if (!cell && gutterRow === null && !emptyBody) return;
    e.preventDefault();
    e.stopPropagation();
    commitEditor();
    const s = getSel();
    if (cell) {
      const inside =
        s.checked.length > 0
          ? s.checked.includes(cell.row)
          : inRange(selectionRange(s), cell.row, cell.col);
      if (!inside) applySel(plainSelection(cell, cell.row));
    } else if (gutterRow !== null && !s.checked.includes(gutterRow)) {
      selectOnlyRow(gutterRow);
    }
    openMenuAtPointer(e.clientX, e.clientY);
  };

  // ---------- Keyboard and mouse ----------

  const lastRow = Math.max(rowCount - 1, 0);
  const lastCol = Math.max(colCount - 1, 0);
  const activeRow = Math.min(cur.active.row, lastRow);
  const activeCol = Math.min(cur.active.col, lastCol);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Keys typed in the cell input are handled by the input itself.
    if (e.target !== e.currentTarget || editRef.current) return;
    if (e.key === 'Escape' && pendingPasteRef.current) {
      clearPending();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (store.rowCount() === 0) {
      // The keymap has no cell to work from, but the menu key must still reach the menu.
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        openMenuAtActive();
      }
      return;
    }
    const s = getSel();
    const hasSelection = hasAnySelection(s);
    let action = resolveNavKey(e, navContext(s.active.row, s.active.col, hasSelection));
    if (e.shiftKey) {
      // Extending moves the focus corner, so its target is computed from the focus cell.
      const extended = resolveNavKey(e, navContext(s.focus.row, s.focus.col, hasSelection));
      if (extended && extended.type === 'move' && extended.extend) action = extended;
    }
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    switch (action.type) {
      case 'move':
        if (action.extend) extendTo(action.row, action.col, true);
        else moveTo(action.row, action.col);
        break;
      case 'edit':
        startEdit(s.active.row, s.active.col, action.mode, action.char);
        break;
      case 'clear':
        if (action.thenEdit && !hasSelection) {
          // Backspace opens an empty editor and keeps the old value until it is committed, so Esc restores it.
          startEdit(s.active.row, s.active.col, 'replace', '');
        } else {
          // Delete, and Backspace over a range or ticked rows, empty the cells without an editor.
          runOp('clear');
        }
        break;
      case 'blocked':
        callbacksRef.current.onBlocked?.();
        break;
      case 'select-all':
        selectAll();
        break;
      case 'select-row':
        selectRow();
        break;
      case 'collapse':
        collapse();
        break;
      case 'context-menu':
        openMenuAtActive();
        break;
    }
  };

  /** A click in the gutter: the checkbox toggles, the number selects the row. */
  const handleGutterPress = (e: React.MouseEvent<HTMLDivElement>, row: number, onCheckbox: boolean) => {
    const s = getSel();
    if (e.shiftKey) {
      // A Shift range replaces the ticked set, from the last row that was ticked or picked.
      applySel(withChecked(s, indexesBetween(Math.min(s.rowAnchor, store.rowCount() - 1), row), s.rowAnchor));
    } else if (onCheckbox || e.ctrlKey || e.metaKey) {
      applySel(withChecked(s, toggleIndex(s.checked, row), row));
    } else {
      selectOnlyRow(row);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Clicks inside the open input place the caret.
    if (target.tagName === 'INPUT') return;
    if (target.closest('[data-checkall]')) {
      toggleAll();
      focusRoot();
      return;
    }
    const gutterRow = gutterRowFromEvent(e);
    if (gutterRow !== null) {
      handleGutterPress(e, gutterRow, !!target.closest('[data-check]'));
      focusRoot();
      return;
    }
    const cell = cellFromEvent(e);
    if (!cell) return;
    // No multiple ranges: Ctrl and Cmd clicks are left alone (on a Mac they also open the menu).
    if (e.ctrlKey || e.metaKey) return;
    if (e.shiftKey) {
      extendTo(cell.row, cell.col, false);
    } else {
      applySel(plainSelection(cell, cell.row));
    }
    // Dragging extends the range until the button is released, even outside the grid.
    endDrag();
    draggingRef.current = true;
    const up = () => endDrag();
    document.addEventListener('mouseup', up);
    dragCleanupRef.current = () => document.removeEventListener('mouseup', up);
    focusRoot();
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    // The button was released somewhere the document never heard about.
    if (e.buttons === 0) {
      endDrag();
      return;
    }
    const cell = cellFromEvent(e);
    if (!cell) return;
    const s = selRef.current;
    if (s.focus.row === cell.row && s.focus.col === cell.col) return;
    applySel({ ...s, focus: cell, checked: NO_ROWS });
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    applySel(plainSelection(cell, cell.row));
    if (store.isEditable()) {
      startEdit(cell.row, cell.col, 'append');
    } else {
      callbacksRef.current.onBlocked?.();
    }
  };

  const handleScroll = () => {
    if (!menuOpenRef.current) return;
    const el = rootRef.current;
    const at = menuScrollRef.current;
    // Opening the menu can itself scroll the active cell into view; that is not the user scrolling.
    if (el && at && el.scrollTop === at.top && el.scrollLeft === at.left) return;
    closeMenu(false);
  };

  // ---------- Render ----------

  const items = virtualizer.getVirtualItems();
  const hasEdits = store.changedCellCount() > 0;
  const editing = edit !== null && edit.store === store && editable ? edit : null;
  const range = rowCount > 0 ? selectionRange(cur) : null;
  const multiRange = range !== null && isMultiCell(range) ? range : null;
  const checkedSet = useMemo(() => new Set(cur.checked), [cur.checked]);
  const allChecked = rowCount > 0 && cur.checked.length === rowCount;
  const someChecked = cur.checked.length > 0 && !allChecked;
  let activeRendered = false;
  const rows: React.ReactNode[] = [];
  for (const item of items) {
    const isActiveRow = item.index === activeRow;
    if (isActiveRow) activeRendered = true;
    const rowChecked = checkedSet.has(item.index);
    // A ticked row already has its own tint, so it carries no separate range tint.
    const inRangeRow =
      multiRange !== null && !rowChecked && item.index >= multiRange.r0 && item.index <= multiRange.r1;
    rows.push(
      <GridRow
        key={item.key}
        store={store}
        layout={layout}
        row={item.index}
        top={item.start}
        activeCol={isActiveRow ? activeCol : -1}
        activeId={activeId}
        edit={editing !== null && editing.row === item.index ? editing : null}
        hasEdits={hasEdits}
        version={version}
        onFinishEdit={finishEdit}
        rowChecked={rowChecked}
        selC0={inRangeRow ? multiRange.c0 : -1}
        selC1={inRangeRow ? multiRange.c1 : -1}
        rowNew={store.isRowNew(item.index)}
      />
    );
  }

  return (
    <div ref={boxRef} className="boomi-crt-gridbox">
      <div
        ref={rootRef}
        role="grid"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-rowcount={rowCount + 1}
        aria-colcount={colCount + 1}
        aria-readonly={!editable}
        aria-multiselectable={true}
        aria-activedescendant={activeRendered ? activeId : undefined}
        className={editable ? 'boomi-crt-grid' : 'boomi-crt-grid boomi-crt-grid--readonly'}
        style={ROOT_STYLE}
        onKeyDown={handleKeyDown}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={handlePaste}
        onScroll={handleScroll}
      >
        <div
          className="boomi-crt-canvas"
          style={{ width: layout.total, height: HEADER_HEIGHT + virtualizer.getTotalSize() }}
        >
          <div role="row" aria-rowindex={1} className="boomi-crt-header" style={layout.rowStyle}>
            <div
              role="columnheader"
              aria-colindex={1}
              aria-label="Row selection"
              className="boomi-crt-corner"
            >
              <span
                role="checkbox"
                aria-checked={allChecked ? true : someChecked ? 'mixed' : false}
                aria-label="Select all rows"
                data-checkall=""
                className={allChecked ? CHECK_ON : someChecked ? CHECK_MIXED : CHECK}
              />
            </div>
            {store.columns.map((name, c) => (
              <div
                key={c}
                role="columnheader"
                aria-colindex={c + 2}
                title={name}
                className={
                  'boomi-crt-hcell' +
                  (c === 0 ? ' boomi-crt-hcell--frozen' : '') +
                  (c === activeCol ? ' boomi-crt-hcell--active' : '')
                }
                style={layout.styles[c]}
              >
                {name}
              </div>
            ))}
          </div>
          {rows}
        </div>
      </div>
      {menu && menuItems && (
        <CrtMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onSelect={handleMenuSelect}
          onClose={() => closeMenu(true)}
        />
      )}
    </div>
  );
});

CrtGrid.displayName = 'CrtGrid';
export default memo(CrtGrid);
