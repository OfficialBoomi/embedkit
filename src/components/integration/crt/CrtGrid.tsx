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
 * This file is the composition: it owns every ref and piece of state, the memoized callbacks
 * and effects that reset them, the virtualizer and the markup. The operations and handlers
 * are in the use* hooks beside it, plain per render closures over one context object (see
 * crtGridTypes), so memoization and effect order are as when they sat in this function.
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
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import { resolveNavKey } from '../../../utils/crt/crtKeymap';
import {
  clampSelection,
  INITIAL_SELECTION,
  isMultiCell,
  NO_ROWS,
  plainSelection,
  selectionRange,
  type GridSelection,
} from '../../../utils/crt/crtGridSelection';
import CrtMenu from './CrtMenu';
import GridRow, { GridHeader } from './CrtGridRow';
import { computeGridInfo } from './gridInfo';
import {
  computeLayout,
  estimateRowSize,
  HEADER_HEIGHT,
  observeGridRect,
  OVERSCAN,
  ROOT_STYLE,
  scrollColumnIntoView,
  scrollRowIntoView,
} from './gridLayout';
import type {
  CommitMove,
  CrtGridHandle,
  CrtGridInfo,
  CrtGridProps,
  CrtOp,
  EditMode,
  EditState,
  FinishEdit,
  GridContext,
  MenuPosition,
  NoticeKind,
  PendingPaste,
  ScrollTarget,
} from './crtGridTypes';
import { useGridClipboard } from './useGridClipboard';
import { useGridKeyboard } from './useGridKeyboard';
import { useGridMenu } from './useGridMenu';
import { useGridPointer } from './useGridPointer';
import { useGridRowOps } from './useGridRowOps';
import { useGridRun } from './useGridRun';
import { useGridSelectionOps } from './useGridSelectionOps';

// The types live in crtGridTypes; the toolbar and the screen import them from here.
export type { CrtGridHandle, CrtGridInfo, CrtGridProps, CrtOp } from './crtGridTypes';

/** After a commit the cell moves like the matching navigation key would. */
const COMMIT_KEYS: Record<CommitMove, { key: string; shiftKey?: boolean }> = {
  down: { key: 'ArrowDown' },
  up: { key: 'ArrowUp' },
  right: { key: 'Tab' },
  left: { key: 'Tab', shiftKey: true },
};

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
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const menuOpenRef = useRef(false);
  // The scroll position when the menu opened: a scroll event that merely reports it is not a scroll.
  const menuScrollRef = useRef<{ top: number; left: number } | null>(null);
  const draggingRef = useRef(false);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const pendingPasteRef = useRef<PendingPaste | null>(null);
  // A scroll that has to wait for the next render, because the table just got taller.
  const scrollTargetRef = useRef<ScrollTarget | null>(null);
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

  /**
   * A plain move: one active cell, no range, no ticked rows. Scrolls it into view. Only the end of
   * a cell edit uses it; keyboard navigation goes through moveActive, which keeps ticked rows.
   */
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

  const ctx: GridContext = {
    store,
    layout,
    rootRef,
    boxRef,
    scrollTargetRef,
    storeRef,
    callbacksRef,
    getSel,
    applySel,
    focusRoot,
    notice,
  };
  const pendingPaste = { pendingPasteRef, clearPending };

  const selection = useGridSelectionOps(ctx);
  const rowOps = useGridRowOps(ctx, selection, deleteBusyRef);
  const clipboard = useGridClipboard(ctx, selection, rowOps, pendingPaste);
  const runOp = useGridRun(ctx, commitEditor, selection, rowOps, clipboard);

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

  const info = useMemo<CrtGridInfo>(
    () => computeGridInfo(cur, store, editable, rowCount),
    [cur, store, editable, rowCount]
  );

  useEffect(() => {
    onInfo?.(info);
  }, [info, onInfo]);

  const { menuItems, openMenuAtActive, handleMenuSelect, handleContextMenu, handleScroll } =
    useGridMenu(
      ctx,
      { menu, setMenu, menuOpenRef, menuScrollRef, closeMenu },
      { commitEditor, runOp, info },
      selection
    );
  const { handleMouseDown, handleMouseMove, handleDoubleClick } = useGridPointer(
    ctx,
    { selRef, draggingRef, dragCleanupRef, endDrag, startEdit },
    selection
  );
  const handleKeyDown = useGridKeyboard(
    ctx,
    { editRef, pending: pendingPaste, startEdit, runOp, openMenuAtActive },
    selection
  );

  // ---------- Render ----------

  const lastRow = Math.max(rowCount - 1, 0);
  const lastCol = Math.max(colCount - 1, 0);
  const activeRow = Math.min(cur.active.row, lastRow);
  const activeCol = Math.min(cur.active.col, lastCol);

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
        onCopy={clipboard.handleCopy}
        onCut={clipboard.handleCut}
        onPaste={clipboard.handlePaste}
        onScroll={handleScroll}
      >
        <div
          className="boomi-crt-canvas"
          style={{ width: layout.total, height: HEADER_HEIGHT + virtualizer.getTotalSize() }}
        >
          <GridHeader
            layout={layout}
            columns={store.columns}
            activeCol={activeCol}
            allChecked={allChecked}
            someChecked={someChecked}
          />
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
