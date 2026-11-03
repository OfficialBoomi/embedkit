/**
 * @file crtGridHistory.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Undo and redo in the lookup table grid. The operations and the key handler are plain closures
 * over a context object (no React hooks inside), so most of this builds them over a real store
 * and a fake context, like crtGridTicking. A few tests mount the real grid and the toolbar,
 * because two things only show there: the grid reports a fresh canUndo after a plain cell edit
 * (the info memo follows the store version), and a key press travels the whole way from the
 * keydown handler to the store.
 *
 * It also holds the audit of the grid operations: each one is one undo step and one store
 * notification, however many store calls it makes inside.
 */
import { createRef } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createCrtStore, type CrtStore } from '../../utils/crt/crtStore';
import type { CrtTableData } from '../../utils/crt/crtTypes';
import {
  clampSelection,
  INITIAL_SELECTION,
  NO_ROWS,
  withChecked,
  type GridSelection,
} from '../../utils/crt/crtGridSelection';
import CrtGrid, { type CrtGridHandle, type CrtGridInfo } from '../../components/integration/crt/CrtGrid';
import CrtToolbar, { isOpEnabled } from '../../components/integration/crt/CrtToolbar';
import type { CrtOp, GridContext, ScrollTarget } from '../../components/integration/crt/crtGridTypes';
import { computeGridInfo } from '../../components/integration/crt/gridInfo';
import { computeLayout, HEADER_HEIGHT, ROW_HEIGHT } from '../../components/integration/crt/gridLayout';
// The use* names are only a naming habit of the grid's split files; none of them calls a React hook.
import { useGridClipboard as buildClipboard } from '../../components/integration/crt/useGridClipboard';
import { useGridKeyboard as buildKeyboard } from '../../components/integration/crt/useGridKeyboard';
import { useGridRowOps as buildRowOps } from '../../components/integration/crt/useGridRowOps';
import { useGridRun as buildRun } from '../../components/integration/crt/useGridRun';
import { useGridSelectionOps as buildSelectionOps } from '../../components/integration/crt/useGridSelectionOps';

const PAGE_ROWS = 5;
const LAST_COL = 2;

const makeTable = (rows: number, overridden: boolean): CrtTableData => {
  const data = Array.from({ length: rows }, (_, r) => [`k${r}`, `v${r}`, `w${r}`]);
  return {
    id: 'table-1',
    name: 'Codes',
    processId: 'process-1',
    processName: 'Process one',
    matchType: 'exact',
    columns: ['Key', 'Value', 'Other'],
    defaultRows: overridden ? [] : data,
    overrideRows: overridden ? data : null,
  };
};

const snapshot = (store: CrtStore): string[][] =>
  Array.from({ length: store.rowCount() }, (_, r) =>
    Array.from({ length: store.colCount() }, (_, c) => store.getCell(r, c))
  );

const idsOf = (store: CrtStore): number[] => Array.from({ length: store.rowCount() }, (_, r) => store.rowId(r));

/** How many undo steps the table holds. Undoes all of them, so call it last. */
const depth = (store: CrtStore): number => {
  let n = 0;
  while (store.undo()) n += 1;
  return n;
};

/** Counts the notifications a store sends while `fn` runs. */
const notifications = (store: CrtStore, fn: () => void): number => {
  const spy = vi.fn();
  const off = store.subscribe(spy);
  fn();
  off();
  return spy.mock.calls.length;
};

interface Options {
  rows?: number;
  overridden?: boolean;
  confirmDelete?: (count: number) => Promise<boolean>;
}

/** The grid's selection state, its store and the handlers built over them. */
function setup({ rows = 12, overridden = true, confirmDelete = async () => true }: Options = {}) {
  const store = createCrtStore(makeTable(rows, overridden));
  let raw: GridSelection = INITIAL_SELECTION;
  const root = document.createElement('div');
  Object.defineProperty(root, 'clientHeight', { value: HEADER_HEIGHT + PAGE_ROWS * ROW_HEIGHT });
  const onBlocked = vi.fn();
  const notice = vi.fn();
  const focusRoot = vi.fn();
  const scrollTargetRef: { current: ScrollTarget | null } = { current: null };
  const ctx: GridContext = {
    store,
    layout: computeLayout(store),
    rootRef: { current: root },
    boxRef: { current: null },
    scrollTargetRef,
    storeRef: { current: store },
    callbacksRef: { current: { onBlocked, onNotice: notice, confirmDelete } },
    getSel: () => clampSelection(raw, store.rowCount(), store.colCount()),
    applySel: (next) => {
      raw = next;
    },
    focusRoot,
    notice,
  };
  const selection = buildSelectionOps(ctx);
  const rowOps = buildRowOps(ctx, selection, { current: false });
  const pendingPasteRef: { current: { mode: 'paste' | 'above' | 'below'; timer: ReturnType<typeof setTimeout> } | null } =
    { current: null };
  const pending = { pendingPasteRef, clearPending: vi.fn() };
  const clipboard = buildClipboard(ctx, selection, rowOps, pending);
  // Stands in for the open editor's commit; a test makes it write to the store.
  const commitEditor = vi.fn();
  const realRun = buildRun(ctx, commitEditor, selection, rowOps, clipboard);
  const runOp = vi.fn(realRun);
  const editRef: { current: null | object } = { current: null };
  const handleKeyDown = buildKeyboard(
    ctx,
    {
      editRef: editRef as never,
      pending,
      startEdit: vi.fn(),
      runOp,
      openMenuAtActive: vi.fn(),
    },
    selection
  );

  const press = (key: string, mods: Partial<React.KeyboardEvent> = {}, target: unknown = root) => {
    const event = {
      key,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      target,
      currentTarget: root,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...mods,
    };
    handleKeyDown(event as unknown as React.KeyboardEvent<HTMLDivElement>);
    return event;
  };

  const clipboardEvent = (text = '') =>
    ({
      target: root,
      currentTarget: root,
      clipboardData: { setData: vi.fn(), getData: () => text },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }) as unknown as React.ClipboardEvent<HTMLDivElement>;

  return {
    store,
    sel: () => ctx.getSel(),
    setSel: (next: GridSelection) => {
      raw = next;
    },
    tick: (...rows: number[]) => {
      raw = withChecked(raw, rows, rows[0] ?? 0);
    },
    range: (r0: number, c0: number, r1: number, c1: number) => {
      raw = {
        active: { row: r0, col: c0 },
        anchor: { row: r0, col: c0 },
        focus: { row: r1, col: c1 },
        checked: NO_ROWS,
        rowAnchor: r0,
      };
    },
    press,
    clipboardEvent,
    editRef,
    pendingPasteRef,
    scrollTargetRef,
    rowOps,
    clipboard,
    runOp,
    commitEditor,
    onBlocked,
    notice,
    focusRoot,
  };
}

const CTRL = { ctrlKey: true };

describe('Ctrl+Z and Ctrl+Y reach the grid history', () => {
  it.each([
    ['Ctrl+Z', 'z', { ctrlKey: true }, 'undo'],
    ['Cmd+Z', 'z', { metaKey: true }, 'undo'],
    ['Ctrl+Y', 'y', { ctrlKey: true }, 'redo'],
    ['Cmd+Y', 'y', { metaKey: true }, 'redo'],
    ['Ctrl+Shift+Z', 'Z', { ctrlKey: true, shiftKey: true }, 'redo'],
    ['Cmd+Shift+Z', 'Z', { metaKey: true, shiftKey: true }, 'redo'],
  ])('%s runs %s and stops the event so no host hotkey or browser history sees it', (_n, k, mods, op) => {
    const h = setup();
    const e = h.press(k, mods);
    expect(h.runOp).toHaveBeenCalledTimes(1);
    expect(h.runOp).toHaveBeenCalledWith(op);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('is not handled while a cell editor is open, so the input keeps the browser text undo', () => {
    const h = setup();
    h.editRef.current = {};
    const e = h.press('z', CTRL);
    expect(h.runOp).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it('ignores a key that came from inside the grid, such as the cell input', () => {
    const h = setup();
    const e = h.press('z', CTRL, document.createElement('input'));
    expect(h.runOp).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves Alt combinations and Shift+Y alone', () => {
    const h = setup();
    expect(h.press('z', { ctrlKey: true, altKey: true }).preventDefault).not.toHaveBeenCalled();
    expect(h.press('y', { ctrlKey: true, shiftKey: true }).preventDefault).not.toHaveBeenCalled();
    expect(h.runOp).not.toHaveBeenCalled();
  });

  it('works on an empty table, so deleting every row can be undone from the keyboard', () => {
    const h = setup({ rows: 3 });
    h.store.deleteRows([0, 1, 2]);
    expect(h.store.rowCount()).toBe(0);
    const e = h.press('z', CTRL);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
    expect(h.store.rowCount()).toBe(3);
    expect(h.notice).toHaveBeenCalledWith('Undid: Delete 3 rows');
    h.press('y', CTRL);
    expect(h.store.rowCount()).toBe(0);
    expect(h.notice).toHaveBeenLastCalledWith('Redid: Delete 3 rows');
  });

  it('on an empty table every other key is still left alone', () => {
    const h = setup({ rows: 0 });
    for (const k of ['a', 'ArrowDown', 'Enter', ' ', 'Delete']) {
      expect(h.press(k).preventDefault).not.toHaveBeenCalled();
    }
    expect(h.press('c', CTRL).preventDefault).not.toHaveBeenCalled();
    expect(h.runOp).not.toHaveBeenCalled();
  });
});

describe('run undo and redo', () => {
  it('undoes a cell edit, says so, selects the cell and scrolls to it', () => {
    const h = setup();
    h.store.setCell(4, 1, 'new');
    h.runOp('undo');
    expect(h.store.getCell(4, 1)).toBe('v4');
    expect(h.notice).toHaveBeenCalledWith('Undid: Edit cell');
    const s = h.sel();
    expect(s.active).toEqual({ row: 4, col: 1 });
    expect(s.anchor).toEqual({ row: 4, col: 1 });
    expect(s.focus).toEqual({ row: 4, col: 1 });
    expect(s.checked).toEqual([]);
    expect(h.scrollTargetRef.current).toEqual({ row: 4, col: 1 });
    expect(h.focusRoot).toHaveBeenCalled();
  });

  it('redoes it with the same selection and a Redid notice', () => {
    const h = setup();
    h.store.setCell(4, 1, 'new');
    h.runOp('undo');
    h.setSel(INITIAL_SELECTION);
    h.runOp('redo');
    expect(h.store.getCell(4, 1)).toBe('new');
    expect(h.notice).toHaveBeenLastCalledWith('Redid: Edit cell');
    expect(h.sel().active).toEqual({ row: 4, col: 1 });
  });

  it('says there is nothing to undo or redo, and leaves the selection alone', () => {
    const h = setup();
    h.range(2, 1, 3, 2);
    const before = h.sel();
    h.runOp('undo');
    expect(h.notice).toHaveBeenLastCalledWith('Nothing to undo');
    h.runOp('redo');
    expect(h.notice).toHaveBeenLastCalledWith('Nothing to redo');
    expect(h.sel()).toEqual(before);
    expect(h.scrollTargetRef.current).toBeNull();
    expect(h.onBlocked).not.toHaveBeenCalled();
  });

  it('is never blocked on a read only table: it says there is nothing to undo', () => {
    const h = setup({ overridden: false });
    h.runOp('undo');
    expect(h.notice).toHaveBeenLastCalledWith('Nothing to undo');
    h.runOp('redo');
    expect(h.notice).toHaveBeenLastCalledWith('Nothing to redo');
    expect(h.onBlocked).not.toHaveBeenCalled();
    h.press('z', CTRL);
    expect(h.onBlocked).not.toHaveBeenCalled();
  });

  it('still blocks every editing operation on a read only table', () => {
    const h = setup({ overridden: false });
    for (const op of ['add-row', 'clear', 'cut', 'delete', 'paste'] as CrtOp[]) h.runOp(op);
    expect(h.onBlocked).toHaveBeenCalledTimes(5);
  });

  it('commits the open editor first, so Undo reverts that commit', () => {
    const h = setup();
    h.store.setCell(0, 0, 'earlier');
    h.commitEditor.mockImplementation(() => {
      h.store.setCell(1, 1, 'typed');
    });
    h.runOp('undo');
    expect(h.commitEditor).toHaveBeenCalledTimes(1);
    expect(h.store.getCell(1, 1)).toBe('v1');
    expect(h.store.getCell(0, 0)).toBe('earlier');
    expect(h.notice).toHaveBeenLastCalledWith('Undid: Edit cell');
  });

  it('selects the restored rows across every column after undoing a delete, and drops ticks', () => {
    const h = setup();
    h.store.deleteRows([2, 3, 4]);
    h.tick(0, 5);
    h.runOp('undo');
    expect(h.store.rowCount()).toBe(12);
    const s = h.sel();
    expect(s.checked).toEqual([]);
    expect(s.active).toEqual({ row: 2, col: 0 });
    expect(s.focus).toEqual({ row: 4, col: LAST_COL });
    expect(h.notice).toHaveBeenLastCalledWith('Undid: Delete 3 rows');
    expect(h.scrollTargetRef.current).toEqual({ row: 2, col: 0 });
  });

  it('selects the box of cells an undone range edit touched', () => {
    const h = setup();
    h.store.fillCells(3, 1, 5, 2, 'x');
    h.runOp('undo');
    const s = h.sel();
    expect(s.active).toEqual({ row: 3, col: 1 });
    expect(s.focus).toEqual({ row: 5, col: 2 });
    expect(snapshot(h.store)[4]).toEqual(['k4', 'v4', 'w4']);
  });

  it('parks on the row that took the place of an undone insert', () => {
    const h = setup();
    h.store.insertRows(5, [['a', 'b', 'c'], ['d', 'e', 'f']]);
    h.runOp('undo');
    expect(h.store.rowCount()).toBe(12);
    expect(h.sel().active).toEqual({ row: 5, col: 0 });
    expect(h.notice).toHaveBeenLastCalledWith('Undid: Insert 2 rows');
  });

  it('selects the rows an undone move brought back', () => {
    const h = setup();
    h.store.moveRows([3, 4], -1);
    h.runOp('undo');
    expect(snapshot(h.store).map((r) => r[0]).slice(0, 6)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4', 'k5']);
    const s = h.sel();
    expect(s.active).toEqual({ row: 3, col: 0 });
    expect(s.focus).toEqual({ row: 4, col: LAST_COL });
  });

  it('goes back to the top left when the undo empties the table', () => {
    const h = setup({ rows: 0 });
    h.store.insertRows(0, [['a', 'b', 'c']]);
    h.range(0, 1, 0, 2);
    h.runOp('undo');
    expect(h.store.rowCount()).toBe(0);
    expect(h.sel()).toEqual(INITIAL_SELECTION);
  });

  it('refills an emptied table and selects every restored row', () => {
    const h = setup({ rows: 4 });
    h.store.deleteRows([0, 1, 2, 3]);
    h.runOp('undo');
    expect(h.store.rowCount()).toBe(4);
    const s = h.sel();
    expect(s.active).toEqual({ row: 0, col: 0 });
    expect(s.focus).toEqual({ row: 3, col: LAST_COL });
  });

  it('keeps the row ids, so a later step that names a row still finds it', () => {
    const h = setup();
    const before = idsOf(h.store);
    h.store.setCell(6, 0, 'x');
    h.store.deleteRows([5, 6, 7]);
    h.runOp('undo');
    h.runOp('undo');
    expect(idsOf(h.store)).toEqual(before);
    expect(h.store.isDirty()).toBe(false);
  });
});

describe('every grid operation is one undo step and one notification', () => {
  it('Clear over ticked rows that are apart makes one step', () => {
    const h = setup();
    const before = snapshot(h.store);
    h.tick(1, 2, 4, 6, 7);
    const sent = notifications(h.store, () => h.runOp('clear'));
    expect(sent).toBe(1);
    expect(h.store.undoLabel()).toBe('Clear contents');
    for (const r of [1, 2, 4, 6, 7]) expect(snapshot(h.store)[r]).toEqual(['', '', '']);
    expect(snapshot(h.store)[3]).toEqual(before[3]);
    h.runOp('undo');
    expect(snapshot(h.store)).toEqual(before);
    expect(h.store.canUndo()).toBe(false);
    expect(h.notice).toHaveBeenLastCalledWith('Undid: Clear contents');
  });

  it('Clear over a cell range makes one step with the same label', () => {
    const h = setup();
    const before = snapshot(h.store);
    h.range(2, 0, 4, 1);
    expect(notifications(h.store, () => h.runOp('clear'))).toBe(1);
    expect(h.store.undoLabel()).toBe('Clear contents');
    h.runOp('undo');
    expect(snapshot(h.store)).toEqual(before);
    expect(h.store.canUndo()).toBe(false);
  });

  it('Clear on one cell makes one step with the same label', () => {
    const h = setup();
    h.range(2, 1, 2, 1);
    h.runOp('clear');
    expect(h.store.getCell(2, 1)).toBe('');
    expect(h.store.undoLabel()).toBe('Clear contents');
    expect(depth(h.store)).toBe(1);
  });

  it('Clear that changes nothing makes no step and no notification', () => {
    const h = setup({ rows: 3 });
    h.store.fillCells(0, 0, 2, 2, '');
    h.range(0, 0, 2, 2);
    expect(notifications(h.store, () => h.runOp('clear'))).toBe(0);
    h.tick(0, 2);
    expect(notifications(h.store, () => h.runOp('clear'))).toBe(0);
    expect(depth(h.store)).toBe(1);
  });

  it('Cut of ticked rows is one step called Cut and gives the rows back with their ids', () => {
    const h = setup();
    const before = snapshot(h.store);
    const ids = idsOf(h.store);
    h.tick(1, 2, 5);
    const sent = notifications(h.store, () => h.clipboard.handleCut(h.clipboardEvent()));
    expect(sent).toBe(1);
    expect(h.store.rowCount()).toBe(9);
    expect(h.store.undoLabel()).toBe('Cut');
    h.runOp('undo');
    expect(snapshot(h.store)).toEqual(before);
    expect(idsOf(h.store)).toEqual(ids);
    expect(h.store.canUndo()).toBe(false);
  });

  it('Cut of a cell range is one step called Cut', () => {
    const h = setup();
    const before = snapshot(h.store);
    h.range(1, 0, 3, 1);
    expect(notifications(h.store, () => h.clipboard.handleCut(h.clipboardEvent()))).toBe(1);
    expect(h.store.undoLabel()).toBe('Cut');
    h.runOp('undo');
    expect(snapshot(h.store)).toEqual(before);
    expect(h.store.canUndo()).toBe(false);
  });

  it('Cut through the clipboard API is one step called Cut', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const h = setup();
    h.tick(0, 1);
    h.runOp('cut');
    await vi.waitFor(() => expect(h.store.rowCount()).toBe(10));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(h.store.undoLabel()).toBe('Cut');
    expect(depth(h.store)).toBe(1);
  });

  it('Paste that grows the table is one step: rows and cells come back out together', () => {
    const h = setup();
    const before = snapshot(h.store);
    const ids = idsOf(h.store);
    h.range(10, 0, 10, 0);
    const sent = notifications(h.store, () => h.clipboard.handlePaste(h.clipboardEvent('a\tb\nc\td\ne\tf')));
    expect(sent).toBe(1);
    expect(h.store.rowCount()).toBe(13);
    expect(h.store.undoLabel()).toBe('Paste');
    h.runOp('undo');
    expect(snapshot(h.store)).toEqual(before);
    expect(idsOf(h.store)).toEqual(ids);
    expect(h.store.canUndo()).toBe(false);
    h.runOp('redo');
    expect(h.store.rowCount()).toBe(13);
    expect(h.store.getCell(12, 1)).toBe('f');
  });

  it('Paste of one value over a range is one step called Paste', () => {
    const h = setup();
    const before = snapshot(h.store);
    h.range(1, 0, 3, 1);
    expect(notifications(h.store, () => h.clipboard.handlePaste(h.clipboardEvent('same')))).toBe(1);
    expect(h.store.getCell(3, 1)).toBe('same');
    expect(h.store.undoLabel()).toBe('Paste');
    h.runOp('undo');
    expect(snapshot(h.store)).toEqual(before);
    expect(h.store.canUndo()).toBe(false);
  });

  it('Paste of cells onto ticked rows is one step called Paste', () => {
    const h = setup();
    const before = snapshot(h.store);
    h.tick(2, 5);
    h.clipboard.handlePaste(h.clipboardEvent('a\tb\tc\nd\te\tf'));
    expect(h.store.undoLabel()).toBe('Paste');
    h.runOp('undo');
    expect(snapshot(h.store)).toEqual(before);
    expect(h.store.canUndo()).toBe(false);
  });

  it('Paste above and Paste below are one step each, called Paste', () => {
    const h = setup();
    const before = snapshot(h.store);
    h.range(4, 0, 4, 0);
    h.pendingPasteRef.current = { mode: 'below', timer: setTimeout(() => {}, 0) };
    h.clipboard.handlePaste(h.clipboardEvent('x\ty\tz\nu\tv\tw'));
    expect(h.store.rowCount()).toBe(14);
    expect(h.store.undoLabel()).toBe('Paste');
    h.pendingPasteRef.current = { mode: 'above', timer: setTimeout(() => {}, 0) };
    h.clipboard.handlePaste(h.clipboardEvent('p\tq\tr'));
    expect(h.store.rowCount()).toBe(15);
    expect(depth(h.store)).toBe(2);
    expect(snapshot(h.store)).toEqual(before);
  });

  it('Paste that would pass the row limit changes nothing and adds no step', () => {
    const h = setup({ rows: 9999 });
    h.range(9998, 0, 9998, 0);
    h.clipboard.handlePaste(h.clipboardEvent('a\nb\nc'));
    expect(h.store.rowCount()).toBe(9999);
    expect(h.store.canUndo()).toBe(false);
    expect(h.notice).toHaveBeenLastCalledWith(expect.stringContaining('10,000'), 'warn');
  });

  it('Add row, Insert above, Insert below and Duplicate are one step each', () => {
    const h = setup();
    const before = snapshot(h.store);
    h.runOp('add-row');
    expect(h.store.undoLabel()).toBe('Insert row');
    h.tick(1, 2);
    h.runOp('insert-above');
    expect(h.store.undoLabel()).toBe('Insert 2 rows');
    h.tick(4);
    h.runOp('insert-below');
    h.tick(3, 5, 6);
    h.runOp('duplicate');
    expect(h.store.undoLabel()).toBe('Insert 3 rows');
    expect(depth(h.store)).toBe(4);
    expect(snapshot(h.store)).toEqual(before);
  });

  it('Delete of several rows is one step and one notification', async () => {
    const h = setup();
    const before = snapshot(h.store);
    const ids = idsOf(h.store);
    h.tick(1, 4, 5, 9);
    // The delete waits for the confirm answer, so the count is read after it has finished.
    const spy = vi.fn();
    h.store.subscribe(spy);
    await h.rowOps.deleteSelected();
    expect(h.store.rowCount()).toBe(8);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(h.store.undoLabel()).toBe('Delete 4 rows');
    h.runOp('undo');
    expect(snapshot(h.store)).toEqual(before);
    expect(idsOf(h.store)).toEqual(ids);
  });

  it('Move up and Move down are one step each', () => {
    const h = setup();
    const before = snapshot(h.store);
    h.tick(3, 4, 8);
    h.runOp('move-up');
    expect(h.store.undoLabel()).toBe('Move 3 rows');
    h.runOp('move-down');
    h.runOp('move-down');
    expect(depth(h.store)).toBe(3);
    expect(snapshot(h.store)).toEqual(before);
  });

  it('a plain cell edit is one step', () => {
    const h = setup();
    h.store.setCell(0, 0, 'x');
    expect(h.store.undoLabel()).toBe('Edit cell');
    expect(depth(h.store)).toBe(1);
  });

  it('undo and redo do not add steps of their own', () => {
    const h = setup();
    h.store.setCell(0, 0, 'x');
    h.runOp('undo');
    h.runOp('redo');
    h.runOp('undo');
    h.runOp('redo');
    expect(h.store.canRedo()).toBe(false);
    expect(depth(h.store)).toBe(1);
  });
});

describe('computeGridInfo history fields', () => {
  const info = (store: CrtStore): CrtGridInfo =>
    computeGridInfo(INITIAL_SELECTION, store, store.isEditable(), store.rowCount());

  it('follows the store: nothing, then a step, then a redo', () => {
    const store = createCrtStore(makeTable(5, true));
    expect(info(store)).toMatchObject({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null });
    store.setCell(0, 0, 'x');
    expect(info(store)).toMatchObject({ canUndo: true, canRedo: false, undoLabel: 'Edit cell', redoLabel: null });
    store.undo();
    expect(info(store)).toMatchObject({ canUndo: false, canRedo: true, undoLabel: null, redoLabel: 'Edit cell' });
  });

  it('is empty on a read only table, and again after Reset', () => {
    const readOnly = createCrtStore(makeTable(5, false));
    expect(info(readOnly)).toMatchObject({ canUndo: false, canRedo: false });
    readOnly.override();
    readOnly.setCell(0, 0, 'x');
    expect(info(readOnly).canUndo).toBe(true);
    readOnly.reset();
    expect(info(readOnly)).toMatchObject({ canUndo: false, canRedo: false, undoLabel: null });
  });
});

/** A full report for the toolbar tests; each test overrides what it cares about. */
const toolbarInfo = (over: Partial<CrtGridInfo> = {}): CrtGridInfo => ({
  selectionLabel: '',
  canEdit: true,
  hasRows: true,
  checkedCount: 0,
  targetCount: 1,
  canMoveUp: true,
  canMoveDown: true,
  atMaxRows: false,
  rowCount: 5,
  canUndo: false,
  canRedo: false,
  undoLabel: null,
  redoLabel: null,
  ...over,
});

describe('isOpEnabled for undo and redo', () => {
  it('follows canUndo and canRedo, and nothing else', () => {
    expect(isOpEnabled('undo', toolbarInfo({ canUndo: true }))).toBe(true);
    expect(isOpEnabled('undo', toolbarInfo({ canUndo: false, canRedo: true }))).toBe(false);
    expect(isOpEnabled('redo', toolbarInfo({ canRedo: true }))).toBe(true);
    expect(isOpEnabled('redo', toolbarInfo({ canRedo: false, canUndo: true }))).toBe(false);
  });

  it('stays on when every row was deleted, because that is when Undo matters most', () => {
    const empty = toolbarInfo({ hasRows: false, rowCount: 0, canUndo: true });
    expect(isOpEnabled('undo', empty)).toBe(true);
  });

  it('is off without a grid', () => {
    expect(isOpEnabled('undo', null)).toBe(false);
    expect(isOpEnabled('redo', null)).toBe(false);
  });
});

describe('CrtToolbar History group', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderBar = (info: CrtGridInfo | null, onRun = vi.fn()) => {
    const utils = render(<CrtToolbar info={info} onRun={onRun} />);
    const history = screen.getByRole('group', { name: 'History' });
    return { ...utils, onRun, history, undo: within(history).getByRole('button', { name: 'Undo' }), redo: within(history).getByRole('button', { name: 'Redo' }) };
  };

  it('starts the second row with Undo then Redo, before the Clipboard group', () => {
    renderBar(toolbarInfo());
    const lines = document.querySelectorAll('.boomi-crt-tools-line');
    expect(lines).toHaveLength(2);
    const groups = Array.from(lines[1].querySelectorAll('[role="group"]')).map((g) => g.getAttribute('aria-label'));
    expect(groups).toEqual(['History', 'Clipboard']);
    expect(lines[1].firstElementChild?.getAttribute('aria-label')).toBe('History');
    const names = within(screen.getByRole('group', { name: 'History' }))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Undo', 'Redo']);
  });

  it('disables both buttons and says why when there is nothing to do', () => {
    const { undo, redo } = renderBar(toolbarInfo());
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    expect(undo).toHaveAttribute('title', 'Nothing to undo');
    expect(redo).toHaveAttribute('title', 'Nothing to redo');
  });

  it('names the step and the shortcut in the tooltips', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    const { undo, redo } = renderBar(
      toolbarInfo({ canUndo: true, canRedo: true, undoLabel: 'Delete 3 rows', redoLabel: 'Edit cell' })
    );
    expect(undo).toBeEnabled();
    expect(redo).toBeEnabled();
    expect(undo).toHaveAttribute('title', 'Undo: Delete 3 rows (Ctrl+Z)');
    expect(redo).toHaveAttribute('title', 'Redo: Edit cell (Ctrl+Y)');
  });

  it('uses the Command key text on a Mac, like the context menu', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const { undo, redo } = renderBar(
      toolbarInfo({ canUndo: true, canRedo: true, undoLabel: 'Paste', redoLabel: 'Cut' })
    );
    expect(undo).toHaveAttribute('title', 'Undo: Paste (⌘Z)');
    expect(redo).toHaveAttribute('title', 'Redo: Cut (⌘Y)');
  });

  it('runs the operation through onRun', () => {
    const { undo, redo, onRun } = renderBar(toolbarInfo({ canUndo: true, canRedo: true, undoLabel: 'a', redoLabel: 'b' }));
    fireEvent.click(undo);
    fireEvent.click(redo);
    expect(onRun.mock.calls).toEqual([['undo'], ['redo']]);
  });

  it('does not run a disabled button', () => {
    const { undo, onRun } = renderBar(toolbarInfo());
    fireEvent.click(undo);
    expect(onRun).not.toHaveBeenCalled();
  });

  it('shows two disabled buttons while there is no grid report yet', () => {
    const { undo, redo } = renderBar(null);
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
  });
});

describe('the mounted grid', () => {
  const mount = (store: CrtStore) => {
    const onInfo = vi.fn<(info: CrtGridInfo) => void>();
    const onNotice = vi.fn();
    const onBlocked = vi.fn();
    const ref = createRef<CrtGridHandle>();
    const utils = render(
      <CrtGrid ref={ref} store={store} ariaLabel="Codes" onInfo={onInfo} onNotice={onNotice} onBlocked={onBlocked} />
    );
    const grid = screen.getByRole('grid');
    const lastInfo = (): CrtGridInfo => onInfo.mock.calls[onInfo.mock.calls.length - 1][0];
    return { ...utils, grid, ref, onInfo, onNotice, onBlocked, lastInfo };
  };

  it('reports a fresh canUndo after a plain cell edit, and after undo and redo', () => {
    const store = createCrtStore(makeTable(6, true));
    const m = mount(store);
    expect(m.lastInfo()).toMatchObject({ canUndo: false, canRedo: false, undoLabel: null });

    act(() => {
      store.setCell(2, 1, 'edited');
    });
    expect(m.lastInfo()).toMatchObject({ canUndo: true, canRedo: false, undoLabel: 'Edit cell' });

    act(() => {
      store.undo();
    });
    expect(m.lastInfo()).toMatchObject({ canUndo: false, canRedo: true, redoLabel: 'Edit cell' });

    act(() => {
      store.redo();
    });
    expect(m.lastInfo()).toMatchObject({ canUndo: true, canRedo: false });
  });

  it('reports a new label after each step, without any other change', () => {
    const store = createCrtStore(makeTable(6, true));
    const m = mount(store);
    act(() => {
      store.setCell(0, 0, 'a');
    });
    expect(m.lastInfo().undoLabel).toBe('Edit cell');
    act(() => {
      store.fillCells(1, 0, 2, 1, 'z');
    });
    expect(m.lastInfo().undoLabel).toBe('Edit 4 cells');
  });

  it('Ctrl+Z on the grid undoes the last step, tells the user, and is prevented', () => {
    const store = createCrtStore(makeTable(6, true));
    const m = mount(store);
    act(() => {
      store.setCell(3, 2, 'edited');
    });
    let allowed = true;
    act(() => {
      allowed = fireEvent.keyDown(m.grid, { key: 'z', ctrlKey: true });
    });
    expect(allowed).toBe(false);
    expect(store.getCell(3, 2)).toBe('w3');
    expect(m.onNotice).toHaveBeenLastCalledWith('Undid: Edit cell', 'info');
    expect(m.lastInfo()).toMatchObject({ canUndo: false, canRedo: true, selectionLabel: 'Row 4, Other' });
    act(() => {
      fireEvent.keyDown(m.grid, { key: 'y', ctrlKey: true });
    });
    expect(store.getCell(3, 2)).toBe('edited');
    expect(m.onNotice).toHaveBeenLastCalledWith('Redid: Edit cell', 'info');
  });

  it('Ctrl+Shift+Z redoes, and Cmd+Z undoes', () => {
    const store = createCrtStore(makeTable(4, true));
    const m = mount(store);
    act(() => {
      store.setCell(0, 0, 'x');
    });
    act(() => {
      fireEvent.keyDown(m.grid, { key: 'z', metaKey: true });
    });
    expect(store.getCell(0, 0)).toBe('k0');
    act(() => {
      fireEvent.keyDown(m.grid, { key: 'Z', ctrlKey: true, shiftKey: true });
    });
    expect(store.getCell(0, 0)).toBe('x');
  });

  it('the toolbar path: run("undo") and run("redo") through the handle', () => {
    const store = createCrtStore(makeTable(4, true));
    const m = mount(store);
    act(() => {
      store.deleteRows([1, 2]);
    });
    act(() => m.ref.current?.run('undo'));
    expect(store.rowCount()).toBe(4);
    expect(m.onNotice).toHaveBeenLastCalledWith('Undid: Delete 2 rows', 'info');
    expect(m.lastInfo()).toMatchObject({ canUndo: false, canRedo: true, rowCount: 4 });
    act(() => m.ref.current?.run('redo'));
    expect(store.rowCount()).toBe(2);
    expect(m.onNotice).toHaveBeenLastCalledWith('Redid: Delete 2 rows', 'info');
  });

  it('Clear over ticked runs through the handle is undone in one step', () => {
    const store = createCrtStore(makeTable(8, true));
    const m = mount(store);
    const before = snapshot(store);
    // Space ticks the active row, the arrow keys move without dropping the ticks.
    act(() => {
      fireEvent.keyDown(m.grid, { key: ' ' });
      fireEvent.keyDown(m.grid, { key: 'ArrowDown' });
      fireEvent.keyDown(m.grid, { key: 'ArrowDown' });
      fireEvent.keyDown(m.grid, { key: ' ' });
      fireEvent.keyDown(m.grid, { key: 'ArrowDown' });
      fireEvent.keyDown(m.grid, { key: ' ' });
    });
    expect(m.lastInfo().checkedCount).toBe(3);
    act(() => m.ref.current?.run('clear'));
    expect(snapshot(store)[0]).toEqual(['', '', '']);
    expect(snapshot(store)[2]).toEqual(['', '', '']);
    expect(snapshot(store)[3]).toEqual(['', '', '']);
    expect(m.lastInfo().undoLabel).toBe('Clear contents');
    act(() => m.ref.current?.run('undo'));
    expect(snapshot(store)).toEqual(before);
    expect(m.lastInfo()).toMatchObject({ canUndo: false, checkedCount: 0 });
  });

  it('Undo on a read only table says there is nothing to undo and is never blocked', () => {
    const store = createCrtStore(makeTable(4, false));
    const m = mount(store);
    act(() => {
      fireEvent.keyDown(m.grid, { key: 'z', ctrlKey: true });
    });
    expect(m.onNotice).toHaveBeenLastCalledWith('Nothing to undo', 'info');
    expect(m.onBlocked).not.toHaveBeenCalled();
    expect(m.lastInfo()).toMatchObject({ canUndo: false, canRedo: false });
  });

  it('Override and Reset start a fresh history without disturbing the selection reset', () => {
    const store = createCrtStore(makeTable(6, false));
    const m = mount(store);
    act(() => {
      store.override();
    });
    expect(m.lastInfo()).toMatchObject({ canEdit: true, canUndo: false });
    act(() => {
      store.setCell(0, 0, 'x');
      fireEvent.keyDown(m.grid, { key: 'ArrowDown' });
      fireEvent.keyDown(m.grid, { key: 'ArrowDown' });
    });
    expect(m.lastInfo()).toMatchObject({ canUndo: true, selectionLabel: 'Row 3, Key' });
    act(() => {
      store.reset();
    });
    // Reset puts the selection back at the top left, as it did before undo existed.
    expect(m.lastInfo()).toMatchObject({
      canEdit: false,
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      selectionLabel: 'Row 1, Key',
    });
    act(() => {
      fireEvent.keyDown(m.grid, { key: 'z', ctrlKey: true });
    });
    expect(m.onNotice).toHaveBeenLastCalledWith('Nothing to undo', 'info');
  });

  it('a new table keeps its own history: the first table is undoable again after switching back', () => {
    const first = createCrtStore(makeTable(4, true));
    const second = createCrtStore(makeTable(4, true));
    const onInfo = vi.fn<(info: CrtGridInfo) => void>();
    const view = render(<CrtGrid store={first} ariaLabel="One" onInfo={onInfo} />);
    act(() => {
      first.setCell(1, 1, 'one');
    });
    view.rerender(<CrtGrid store={second} ariaLabel="Two" onInfo={onInfo} />);
    expect(onInfo.mock.calls[onInfo.mock.calls.length - 1][0]).toMatchObject({ canUndo: false });
    act(() => {
      second.setCell(0, 0, 'two');
    });
    view.rerender(<CrtGrid store={first} ariaLabel="One" onInfo={onInfo} />);
    expect(onInfo.mock.calls[onInfo.mock.calls.length - 1][0]).toMatchObject({
      canUndo: true,
      undoLabel: 'Edit cell',
    });
    act(() => {
      fireEvent.keyDown(screen.getByRole('grid'), { key: 'z', ctrlKey: true });
    });
    expect(first.getCell(1, 1)).toBe('v1');
    expect(second.getCell(0, 0)).toBe('two');
  });
});
