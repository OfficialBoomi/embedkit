/**
 * @file CrtGrid.tsx
 * @component CrtGrid
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * An Excel-like editable grid for one cross reference table. Rows are virtualized
 * (up to 10,000), every column renders (at most 20). The row number gutter and the
 * first data column are frozen. The grid owns only view state (active cell, open
 * editor); the data lives in the store, and every keyboard decision comes from the
 * pure rules in crtKeymap.
 *
 * Keys are stopped here on purpose: inside a shadow root only text inputs are
 * shielded from host page hotkeys, a div grid has to stop the keys it handles.
 *
 * @return {JSX.Element} The rendered grid.
 */

import {
  memo,
  useCallback,
  useEffect,
  useId,
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
import type { CrtStore } from '../../../utils/crt/crtStore';
import type { CrtCell } from '../../../utils/crt/crtTypes';
import { resolveEditKey, resolveNavKey, type NavContext } from '../../../utils/crt/crtKeymap';

/** Pixel sizes. The CSS reads the same values through custom properties on the root. */
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 32;
const GUTTER_WIDTH = 64;
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

const ORIGIN: CrtCell = { row: 0, col: 0 };

const ROOT_STYLE = {
  '--crt-row-h': `${ROW_HEIGHT}px`,
  '--crt-header-h': `${HEADER_HEIGHT}px`,
  '--crt-gutter-w': `${GUTTER_WIDTH}px`,
} as React.CSSProperties;

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

/** After a commit the cell moves like the matching navigation key would. */
const COMMIT_KEYS: Record<CommitMove, { key: string; shiftKey?: boolean }> = {
  down: { key: 'ArrowDown' },
  up: { key: 'ArrowUp' },
  right: { key: 'Tab' },
  left: { key: 'Tab', shiftKey: true },
};

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

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

/** Precomputed class strings: bit 1 frozen, 2 active, 4 edited, 8 editing. */
const CELL_CLASS: string[] = [];
for (let flags = 0; flags < 16; flags++) {
  CELL_CLASS.push(
    [
      'boomi-crt-cell',
      flags & 1 ? 'boomi-crt-cell--frozen' : '',
      flags & 2 ? 'boomi-crt-cell--active' : '',
      flags & 4 ? 'boomi-crt-cell--edited' : '',
      flags & 8 ? 'boomi-crt-cell--editing' : '',
    ]
      .filter(Boolean)
      .join(' ')
  );
}

/** Striping follows the displayed row number (row 1 is odd), not the DOM position. */
const ROW_ODD = 'boomi-crt-row boomi-crt-row--odd';
const ROW_EVEN = 'boomi-crt-row boomi-crt-row--even';
const GUTTER = 'boomi-crt-gutter';
const GUTTER_ACTIVE = 'boomi-crt-gutter boomi-crt-gutter--active';

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
}

/** Memoized so moving the active cell redraws two rows, not the whole window. */
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
}: GridRowProps) {
  const cells: React.ReactNode[] = [];
  const cols = layout.widths.length;
  for (let c = 0; c < cols; c++) {
    const text = store.getCell(row, c);
    const isActive = c === activeCol;
    const editing = edit !== null && edit.col === c;
    const flags =
      (c === 0 ? 1 : 0) |
      (isActive ? 2 : 0) |
      (hasEdits && store.isCellEdited(row, c) ? 4 : 0) |
      (editing ? 8 : 0);
    cells.push(
      <div
        key={c}
        role="gridcell"
        id={isActive ? activeId : undefined}
        aria-colindex={c + 2}
        aria-selected={isActive}
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
      data-r={row}
      className={row % 2 === 0 ? ROW_ODD : ROW_EVEN}
      style={{ top, width: layout.total }}
    >
      <div role="rowheader" aria-colindex={1} className={activeCol >= 0 ? GUTTER_ACTIVE : GUTTER}>
        {row + 1}
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
 */
export interface CrtGridProps {
  store: CrtStore;
  ariaLabel: string;
  onBlocked?: () => void;
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

const CrtGrid: React.FC<CrtGridProps> = ({ store, ariaLabel, onBlocked }) => {
  const version = useSyncExternalStore(store.subscribe, store.version);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeId = `${useId()}-active`;
  const [active, setActive] = useState<CrtCell>(ORIGIN);
  const [edit, setEdit] = useState<EditState | null>(null);
  // Mirrors `edit` for handlers and the range extractor, which must not go stale.
  const editRef = useRef<EditState | null>(null);

  const rowCount = store.rowCount();
  const colCount = store.colCount();
  const editable = store.isEditable();
  const layout = useMemo(() => computeLayout(store), [store]);

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

  // A new table starts from the top left with nothing open.
  useEffect(() => {
    editRef.current = null;
    setEdit(null);
    setActive(ORIGIN);
    const el = rootRef.current;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }, [store]);

  // Reset to defaults makes the table read only: drop any open editor.
  useEffect(() => {
    if (editable) return;
    editRef.current = null;
    setEdit(null);
  }, [editable]);

  const navContext = useCallback(
    (row: number, col: number): NavContext => {
      const el = rootRef.current;
      const viewport = el ? el.clientHeight - HEADER_HEIGHT : 0;
      return {
        row,
        col,
        rowCount: store.rowCount(),
        colCount: store.colCount(),
        pageRows: Math.max(1, Math.floor(viewport / ROW_HEIGHT)),
        editable: store.isEditable(),
      };
    },
    [store]
  );

  const moveTo = useCallback(
    (row: number, col: number) => {
      setActive({ row, col });
      const el = rootRef.current;
      if (!el) return;
      scrollRowIntoView(el, row);
      scrollColumnIntoView(el, layout, col);
    },
    [layout]
  );

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
        const next = resolveNavKey(COMMIT_KEYS[move], navContext(current.row, current.col));
        if (next && next.type === 'move') moveTo(next.row, next.col);
      }
      if (refocus) rootRef.current?.focus({ preventScroll: true });
    },
    [store, navContext, moveTo]
  );

  const lastRow = Math.max(rowCount - 1, 0);
  const lastCol = Math.max(colCount - 1, 0);
  const activeRow = Math.min(active.row, lastRow);
  const activeCol = Math.min(active.col, lastCol);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Keys typed in the cell input are handled by the input itself.
    if (e.target !== e.currentTarget || editRef.current) return;
    const action = resolveNavKey(e, navContext(activeRow, activeCol));
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    switch (action.type) {
      case 'move':
        // Range selection is not part of this version, so `extend` is ignored.
        moveTo(action.row, action.col);
        break;
      case 'edit':
        startEdit(activeRow, activeCol, action.mode, action.char);
        break;
      case 'clear':
        if (action.thenEdit) {
          // Backspace opens an empty editor and keeps the old value until it is committed, so Esc restores it.
          startEdit(activeRow, activeCol, 'replace', '');
        } else {
          store.setCell(activeRow, activeCol, '');
        }
        break;
      case 'blocked':
        onBlocked?.();
        break;
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Clicks inside the open input place the caret.
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    setActive(cell);
    rootRef.current?.focus({ preventScroll: true });
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const cell = cellFromEvent(e);
    if (!cell) return;
    setActive(cell);
    if (store.isEditable()) {
      startEdit(cell.row, cell.col, 'append');
    } else {
      onBlocked?.();
    }
  };

  const items = virtualizer.getVirtualItems();
  const hasEdits = store.changedCellCount() > 0;
  const editing = edit !== null && edit.store === store && editable ? edit : null;
  let activeRendered = false;
  const rows: React.ReactNode[] = [];
  for (const item of items) {
    const isActiveRow = item.index === activeRow;
    if (isActiveRow) activeRendered = true;
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
      />
    );
  }

  return (
    <div
      ref={rootRef}
      role="grid"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-rowcount={rowCount + 1}
      aria-colcount={colCount + 1}
      aria-readonly={!editable}
      aria-activedescendant={activeRendered ? activeId : undefined}
      className={editable ? 'boomi-crt-grid' : 'boomi-crt-grid boomi-crt-grid--readonly'}
      style={ROOT_STYLE}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className="boomi-crt-canvas"
        style={{ width: layout.total, height: HEADER_HEIGHT + virtualizer.getTotalSize() }}
      >
        <div role="row" aria-rowindex={1} className="boomi-crt-header" style={layout.rowStyle}>
          <div
            role="columnheader"
            aria-colindex={1}
            aria-label="Row number"
            className="boomi-crt-corner"
          />
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
  );
};

CrtGrid.displayName = 'CrtGrid';
export default memo(CrtGrid);
