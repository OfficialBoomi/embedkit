/**
 * @file crtGridTicking.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Row ticking from the keyboard in the lookup table grid. The selection operations and the
 * keydown handler are plain closures over a context object (no React hooks inside), so they are
 * built here directly over a real store and a fake context, without mounting the grid. Covers
 * Space ticking, plain moves that keep the ticks, the keys that still clear them, and that the
 * row operations act on every ticked row after the active cell has moved away.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCrtStore } from '../../utils/crt/crtStore';
import type { CrtTableData } from '../../utils/crt/crtTypes';
import {
  clampSelection,
  INITIAL_SELECTION,
  NO_ROWS,
  type GridSelection,
} from '../../utils/crt/crtGridSelection';
import type { GridContext } from '../../components/integration/crt/crtGridTypes';
import { computeLayout, HEADER_HEIGHT, ROW_HEIGHT } from '../../components/integration/crt/gridLayout';
// The use* names are only a naming habit of the grid's split files; none of them calls a React hook.
import { useGridKeyboard as buildKeyboard } from '../../components/integration/crt/useGridKeyboard';
import { useGridClipboard as buildClipboard } from '../../components/integration/crt/useGridClipboard';
import { useGridRowOps as buildRowOps } from '../../components/integration/crt/useGridRowOps';
import { useGridSelectionOps as buildSelectionOps } from '../../components/integration/crt/useGridSelectionOps';

/** Visible rows of the fake viewport, so a page key moves a known distance. */
const PAGE_ROWS = 5;

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
  const ctx: GridContext = {
    store,
    layout: computeLayout(store),
    rootRef: { current: root },
    boxRef: { current: null },
    scrollTargetRef: { current: null },
    storeRef: { current: store },
    callbacksRef: { current: { onBlocked, onNotice: notice, confirmDelete } },
    getSel: () => clampSelection(raw, store.rowCount(), store.colCount()),
    applySel: (next) => {
      raw = next;
    },
    focusRoot: vi.fn(),
    notice,
  };
  const selection = buildSelectionOps(ctx);
  const rowOps = buildRowOps(ctx, selection, { current: false });
  const pending = { pendingPasteRef: { current: null }, clearPending: vi.fn() };
  const clipboard = buildClipboard(ctx, selection, rowOps, pending);
  const startEdit = vi.fn();
  const runOp = vi.fn();
  const openMenuAtActive = vi.fn();
  const handleKeyDown = buildKeyboard(
    ctx,
    { editRef: { current: null }, pending, startEdit, runOp, openMenuAtActive },
    selection
  );

  const press = (key: string, mods: Partial<React.KeyboardEvent> = {}) => {
    const event = {
      key,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      target: root,
      currentTarget: root,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...mods,
    };
    handleKeyDown(event as unknown as React.KeyboardEvent<HTMLDivElement>);
    return event;
  };
  const pressTimes = (key: string, n: number) => {
    for (let i = 0; i < n; i++) press(key);
  };

  return {
    store,
    root,
    sel: () => ctx.getSel(),
    setSel: (next: GridSelection) => {
      raw = next;
    },
    press,
    pressTimes,
    selection,
    rowOps,
    clipboard,
    startEdit,
    runOp,
    onBlocked,
    notice,
    column: (c: number) => Array.from({ length: store.rowCount() }, (_, r) => store.getCell(r, c)),
  };
}

type Harness = ReturnType<typeof setup>;

/** Ticks row 1 and row 4, then moves on to row 6, so the active cell is on neither. */
function tickOneAndFour(h: Harness) {
  h.pressTimes('ArrowDown', 1);
  h.press(' ');
  h.pressTimes('ArrowDown', 3);
  h.press(' ');
  h.pressTimes('ArrowDown', 2);
}

describe('Space ticks the active row', () => {
  it('ticks the active row, keeps the active cell and sets the row anchor', () => {
    const h = setup();
    h.pressTimes('ArrowDown', 3);
    h.press('ArrowRight');
    h.press(' ');
    const s = h.sel();
    expect(s.checked).toEqual([3]);
    expect(s.active).toEqual({ row: 3, col: 1 });
    expect(s.anchor).toEqual({ row: 3, col: 1 });
    expect(s.focus).toEqual({ row: 3, col: 1 });
    expect(s.rowAnchor).toBe(3);
  });

  it('unticks the row on a second press', () => {
    const h = setup();
    h.press(' ');
    expect(h.sel().checked).toEqual([0]);
    h.press(' ');
    expect(h.sel().checked).toEqual([]);
  });

  it('stops and prevents the event, so the page does not scroll and the host never sees it', () => {
    const h = setup();
    const e = h.press(' ');
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('does not open an editor any more', () => {
    const h = setup();
    h.press(' ');
    expect(h.startEdit).not.toHaveBeenCalled();
    expect(h.runOp).not.toHaveBeenCalled();
  });

  it('works on a read only table and never reports it as blocked', () => {
    const h = setup({ overridden: false });
    expect(h.store.isEditable()).toBe(false);
    h.press(' ');
    h.pressTimes('ArrowDown', 2);
    h.press(' ');
    expect(h.sel().checked).toEqual([0, 2]);
    expect(h.onBlocked).not.toHaveBeenCalled();
  });

  it('keeps the ticked rows ascending whatever order they were ticked in', () => {
    const h = setup();
    h.pressTimes('ArrowDown', 6);
    h.press(' ');
    h.pressTimes('ArrowUp', 4);
    h.press(' ');
    h.pressTimes('ArrowDown', 1);
    h.press(' ');
    expect(h.sel().checked).toEqual([2, 3, 6]);
  });

  it('with a cell range selected it ticks only the active row and drops the range', () => {
    const h = setup();
    h.press('ArrowDown', { shiftKey: true });
    h.press('ArrowDown', { shiftKey: true });
    h.press('ArrowRight', { shiftKey: true });
    expect(h.sel().focus).toEqual({ row: 2, col: 1 });
    h.press(' ');
    const s = h.sel();
    expect(s.checked).toEqual([0]);
    expect(s.anchor).toEqual(s.active);
    expect(s.focus).toEqual(s.active);
  });

  it('scrolls the active row into view when it was scrolled away', () => {
    const h = setup({ rows: 100 });
    h.pressTimes('ArrowDown', 2);
    h.root.scrollTop = 50 * ROW_HEIGHT;
    h.press(' ');
    expect(h.root.scrollTop).toBeLessThan(50 * ROW_HEIGHT);
    expect(h.root.scrollTop).toBeLessThanOrEqual(2 * ROW_HEIGHT);
  });

  it('Ctrl+Space and Cmd+Space are left alone, so the host keeps them', () => {
    const h = setup();
    const ctrl = h.press(' ', { ctrlKey: true });
    const meta = h.press(' ', { metaKey: true });
    expect(h.sel().checked).toEqual([]);
    expect(ctrl.preventDefault).not.toHaveBeenCalled();
    expect(meta.preventDefault).not.toHaveBeenCalled();
  });
});

describe('plain keyboard moves keep the ticked rows', () => {
  it('builds a non-adjacent selection from the keyboard alone', () => {
    const h = setup();
    h.press(' ');
    h.pressTimes('ArrowDown', 2);
    h.press(' ');
    h.pressTimes('ArrowDown', 4);
    h.press(' ');
    expect(h.sel().checked).toEqual([0, 2, 6]);
    expect(h.sel().active.row).toBe(6);
  });

  it.each([
    ['ArrowDown', {}, { row: 6, col: 0 }],
    ['ArrowUp', {}, { row: 4, col: 0 }],
    ['ArrowRight', {}, { row: 5, col: 1 }],
    ['ArrowLeft', {}, { row: 5, col: 0 }],
    ['Tab', {}, { row: 5, col: 1 }],
    ['PageDown', {}, { row: 5 + PAGE_ROWS, col: 0 }],
    ['PageUp', {}, { row: 0, col: 0 }],
    ['Home', {}, { row: 5, col: 0 }],
    ['End', {}, { row: 5, col: 2 }],
    ['ArrowDown', { ctrlKey: true }, { row: 11, col: 0 }],
    ['ArrowUp', { metaKey: true }, { row: 0, col: 0 }],
    ['Home', { ctrlKey: true }, { row: 0, col: 0 }],
    ['End', { metaKey: true }, { row: 11, col: 2 }],
  ])('%s %j moves only the active cell', (key, mods, expected) => {
    const h = setup();
    h.setSel({
      active: { row: 5, col: 0 },
      anchor: { row: 5, col: 0 },
      focus: { row: 5, col: 0 },
      checked: [1, 3, 5],
      rowAnchor: 3,
    });
    h.press(key, mods);
    const s = h.sel();
    expect(s.active).toEqual(expected);
    expect(s.anchor).toEqual(expected);
    expect(s.focus).toEqual(expected);
    expect(s.checked).toEqual([1, 3, 5]);
    expect(s.rowAnchor).toBe(3);
  });

  it('Shift+Tab keeps the ticks too, because it is a plain move', () => {
    const h = setup();
    h.press(' ');
    h.pressTimes('Tab', 2);
    h.press('Tab', { shiftKey: true });
    const s = h.sel();
    expect(s.checked).toEqual([0]);
    expect(s.active).toEqual({ row: 0, col: 1 });
  });

  it('Tab wrapping to the next row keeps the ticks', () => {
    const h = setup();
    h.press(' ');
    h.pressTimes('Tab', 3);
    expect(h.sel().active).toEqual({ row: 1, col: 0 });
    expect(h.sel().checked).toEqual([0]);
  });

  it('keeps the same checked array, so memoized readers stay stable', () => {
    const h = setup();
    h.press(' ');
    const before = h.sel().checked;
    h.press('ArrowDown');
    expect(h.sel().checked).toBe(before);
  });

  it('a move at the edge of the grid still keeps the ticks', () => {
    const h = setup();
    h.press(' ');
    h.press('ArrowUp');
    expect(h.sel().checked).toEqual([0]);
    expect(h.sel().active).toEqual({ row: 0, col: 0 });
  });

  it('collapses a range spanning the clicked row to the new active cell', () => {
    const h = setup();
    h.selection.selectOnlyRow(2);
    expect(h.sel().checked).toEqual([2]);
    expect(h.sel().focus.col).toBe(2);
    h.press('ArrowDown');
    const s = h.sel();
    expect(s.checked).toEqual([2]);
    expect(s.anchor).toEqual(s.active);
    expect(s.focus).toEqual(s.active);
  });

  it('with nothing ticked a move is the plain move it always was', () => {
    const h = setup();
    h.press('ArrowDown');
    h.press('ArrowRight');
    const s = h.sel();
    expect(s.active).toEqual({ row: 1, col: 1 });
    expect(s.anchor).toEqual({ row: 1, col: 1 });
    expect(s.focus).toEqual({ row: 1, col: 1 });
    expect(s.checked).toBe(NO_ROWS);
    expect(s.rowAnchor).toBe(1);
  });

  it('with nothing ticked a plain move drops a cell range', () => {
    const h = setup();
    h.press('ArrowDown', { shiftKey: true });
    h.press('ArrowRight', { shiftKey: true });
    h.press('ArrowDown');
    const s = h.sel();
    expect(s.anchor).toEqual(s.active);
    expect(s.focus).toEqual(s.active);
  });

  it('ticks that were all removed by Space behave like no ticks', () => {
    const h = setup();
    h.press(' ');
    h.press(' ');
    h.press('ArrowDown');
    const s = h.sel();
    expect(s.checked).toEqual([]);
    expect(s.rowAnchor).toBe(1);
  });
});

describe('keys that still clear the ticked rows', () => {
  const ticked = (h: Harness) => {
    h.press(' ');
    h.pressTimes('ArrowDown', 2);
    h.press(' ');
    expect(h.sel().checked).toEqual([0, 2]);
  };

  it('Shift+arrow extends the cell range and clears the ticks', () => {
    const h = setup();
    ticked(h);
    h.press('ArrowDown', { shiftKey: true });
    const s = h.sel();
    expect(s.checked).toEqual([]);
    expect(s.focus).toEqual({ row: 3, col: 0 });
    expect(s.anchor).toEqual({ row: 2, col: 0 });
  });

  it('Escape collapses and clears the ticks', () => {
    const h = setup();
    ticked(h);
    const e = h.press('Escape');
    expect(h.sel().checked).toEqual([]);
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it('Escape with nothing selected is left to bubble', () => {
    const h = setup();
    const e = h.press('Escape');
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it('Ctrl+A selects every cell and clears the ticks', () => {
    const h = setup();
    ticked(h);
    h.press('a', { ctrlKey: true });
    const s = h.sel();
    expect(s.checked).toEqual([]);
    expect(s.anchor).toEqual({ row: 0, col: 0 });
    expect(s.focus).toEqual({ row: 11, col: 2 });
  });

  it('Shift+Space selects the row range and clears the ticks', () => {
    const h = setup();
    ticked(h);
    h.press(' ', { shiftKey: true });
    const s = h.sel();
    expect(s.checked).toEqual([]);
    expect(s.anchor).toEqual({ row: 2, col: 0 });
    expect(s.focus).toEqual({ row: 2, col: 2 });
  });
});

describe('what kept ticks mean for the keys that act on a row or a cell', () => {
  it('Delete and Backspace clear the ticked rows, not the cell the active cell moved to', () => {
    const h = setup();
    tickOneAndFour(h);
    expect(h.sel().active.row).toBe(6);
    h.press('Delete');
    h.press('Backspace');
    expect(h.runOp).toHaveBeenCalledTimes(2);
    expect(h.runOp).toHaveBeenNthCalledWith(1, 'clear');
    expect(h.runOp).toHaveBeenNthCalledWith(2, 'clear');
    expect(h.startEdit).not.toHaveBeenCalled();
  });

  it('typing, Enter and F2 edit the active cell and leave the ticks alone until the edit ends', () => {
    const h = setup();
    tickOneAndFour(h);
    h.press('x');
    h.press('Enter');
    h.press('F2');
    expect(h.startEdit).toHaveBeenNthCalledWith(1, 6, 0, 'replace', 'x');
    expect(h.startEdit).toHaveBeenNthCalledWith(2, 6, 0, 'select-all', undefined);
    expect(h.startEdit).toHaveBeenNthCalledWith(3, 6, 0, 'append', undefined);
    expect(h.sel().checked).toEqual([1, 4]);
  });

  it('Backspace with nothing ticked still opens an empty editor', () => {
    const h = setup();
    h.pressTimes('ArrowDown', 3);
    h.press('Backspace');
    expect(h.startEdit).toHaveBeenCalledWith(3, 0, 'replace', '');
    expect(h.runOp).not.toHaveBeenCalled();
  });
});

describe('row operations act on every ticked row after the active cell has moved', () => {
  it('targetsOf is the ticked rows, not the active row', () => {
    const h = setup();
    tickOneAndFour(h);
    expect(h.selection.targetsOf(h.sel())).toEqual([1, 4]);
  });

  it('delete removes all ticked rows', async () => {
    const confirmDelete = vi.fn(async () => true);
    const h = setup({ confirmDelete });
    tickOneAndFour(h);
    await h.rowOps.deleteSelected();
    expect(confirmDelete).toHaveBeenCalledWith(2);
    expect(h.column(0)).toEqual(['k0', 'k2', 'k3', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10', 'k11']);
    expect(h.sel().checked).toEqual([]);
  });

  it('move down moves all ticked rows and keeps them ticked', () => {
    const h = setup();
    tickOneAndFour(h);
    h.rowOps.moveSelected(1);
    expect(h.column(0)).toEqual(['k0', 'k2', 'k1', 'k3', 'k5', 'k4', 'k6', 'k7', 'k8', 'k9', 'k10', 'k11']);
    expect(h.sel().checked).toEqual([2, 5]);
  });

  it('move up moves all ticked rows', () => {
    const h = setup();
    tickOneAndFour(h);
    h.rowOps.moveSelected(-1);
    expect(h.column(0).slice(0, 6)).toEqual(['k1', 'k0', 'k2', 'k4', 'k3', 'k5']);
    expect(h.sel().checked).toEqual([0, 3]);
  });

  it('duplicate copies all ticked rows below the last one', () => {
    const h = setup();
    tickOneAndFour(h);
    h.rowOps.duplicate();
    expect(h.store.rowCount()).toBe(14);
    expect(h.column(0).slice(0, 8)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4', 'k1', 'k4', 'k5']);
  });

  it('insert above and below add one blank row per ticked row', () => {
    const h = setup();
    tickOneAndFour(h);
    h.rowOps.insertBlank('above');
    expect(h.store.rowCount()).toBe(14);
    expect(h.column(0).slice(0, 4)).toEqual(['k0', '', '', 'k1']);

    const g = setup();
    tickOneAndFour(g);
    g.rowOps.insertBlank('below');
    expect(g.store.rowCount()).toBe(14);
    expect(g.column(0).slice(4, 8)).toEqual(['k4', '', '', 'k5']);
  });

  it('clear empties every cell of all ticked rows and nothing else', () => {
    const h = setup();
    tickOneAndFour(h);
    h.rowOps.clearSelected();
    expect(h.column(0)).toEqual(['k0', '', 'k2', 'k3', '', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10', 'k11']);
    expect(h.column(2)).toEqual(['w0', '', 'w2', 'w3', '', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w11']);
  });

  it('copy puts the ticked rows on the clipboard', () => {
    const h = setup();
    tickOneAndFour(h);
    const setData = vi.fn();
    const event = {
      target: h.root,
      currentTarget: h.root,
      clipboardData: { setData },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    h.clipboard.handleCopy(event as unknown as React.ClipboardEvent<HTMLDivElement>);
    expect(setData).toHaveBeenCalledWith('text/plain', 'k1\tv1\tw1\nk4\tv4\tw4');
    expect(h.notice).toHaveBeenCalledWith('Copied 2 rows');
  });

  it('cut removes all ticked rows', () => {
    const h = setup();
    tickOneAndFour(h);
    const event = {
      target: h.root,
      currentTarget: h.root,
      clipboardData: { setData: vi.fn() },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    h.clipboard.handleCut(event as unknown as React.ClipboardEvent<HTMLDivElement>);
    expect(h.column(0)).toEqual(['k0', 'k2', 'k3', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10', 'k11']);
  });

  it('paste over cells starts at the first ticked row, not at the active cell', () => {
    const h = setup();
    tickOneAndFour(h);
    const event = {
      target: h.root,
      currentTarget: h.root,
      clipboardData: { getData: () => 'p\tq\tr' },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    h.clipboard.handlePaste(event as unknown as React.ClipboardEvent<HTMLDivElement>);
    expect(h.column(0)[1]).toBe('p');
    expect(h.column(0)[6]).toBe('k6');
  });
});
