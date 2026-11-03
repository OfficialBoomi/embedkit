/**
 * @file crtFindGrid.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * What the grid does for find: the class table flags, the memoized row taking one mask number and
 * one column number (and drawing again only when those change), the highlight classes of a mounted
 * grid, the find keys (stopped and prevented only when the screen listens), and the handle the
 * screen steps through matches with (show a cell without taking focus, report the active cell,
 * commit an open editor).
 *
 * The box sizes are faked so the virtualized grid draws rows in jsdom. Not covered here, and only
 * checkable in a browser: the colours, and the scroll position after showCell.
 */
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createCrtStore, type CrtStore } from '../../utils/crt/crtStore';
import type { CrtTableData } from '../../utils/crt/crtTypes';
import CrtGrid, { type CrtGridHandle } from '../../components/integration/crt/CrtGrid';
import GridRow from '../../components/integration/crt/CrtGridRow';
import type { CrtFindHighlight } from '../../components/integration/crt/crtGridTypes';
import { CELL_CLASS, computeLayout, FLAG_MATCH, FLAG_MATCH_CURRENT } from '../../components/integration/crt/gridLayout';

const makeTable = (rows: number, overridden = true): CrtTableData => {
  const data = Array.from({ length: rows }, (_, r) => [`k${r}`, `v${r}`, `w${r}`]);
  return {
    id: 't',
    name: 'Codes',
    processId: 'p',
    processName: 'Process',
    matchType: 'exact',
    columns: ['Key', 'Value', 'Other'],
    defaultRows: overridden ? [] : data,
    overrideRows: overridden ? data : null,
  };
};

describe('the class tables', () => {
  it('keeps every earlier combination exactly as it was', () => {
    expect(CELL_CLASS).toHaveLength(128);
    expect(CELL_CLASS[0]).toBe('boomi-crt-cell');
    expect(CELL_CLASS[1]).toBe('boomi-crt-cell boomi-crt-cell--frozen');
    expect(CELL_CLASS[2]).toBe('boomi-crt-cell boomi-crt-cell--active');
    expect(CELL_CLASS[4]).toBe('boomi-crt-cell boomi-crt-cell--edited');
    expect(CELL_CLASS[8]).toBe('boomi-crt-cell boomi-crt-cell--editing');
    expect(CELL_CLASS[16]).toBe('boomi-crt-cell boomi-crt-cell--selected');
    expect(CELL_CLASS[31]).toBe(
      'boomi-crt-cell boomi-crt-cell--frozen boomi-crt-cell--active boomi-crt-cell--edited boomi-crt-cell--editing boomi-crt-cell--selected'
    );
    for (let flags = 0; flags < 32; flags++) expect(CELL_CLASS[flags]).not.toContain('match');
  });

  it('adds a match flag and a current match flag', () => {
    expect(FLAG_MATCH).toBe(32);
    expect(FLAG_MATCH_CURRENT).toBe(96);
    expect(CELL_CLASS[FLAG_MATCH]).toBe('boomi-crt-cell boomi-crt-cell--match');
    expect(CELL_CLASS[FLAG_MATCH_CURRENT]).toBe('boomi-crt-cell boomi-crt-cell--match boomi-crt-cell--match-current');
  });

  it('combines with the other flags', () => {
    expect(CELL_CLASS[FLAG_MATCH_CURRENT | 1 | 2]).toBe(
      'boomi-crt-cell boomi-crt-cell--frozen boomi-crt-cell--active boomi-crt-cell--match boomi-crt-cell--match-current'
    );
    expect(CELL_CLASS[FLAG_MATCH | 4 | 16]).toContain('boomi-crt-cell--match');
  });
});

describe('GridRow with find', () => {
  const baseProps = (store: CrtStore, over: Partial<React.ComponentProps<typeof GridRow>> = {}) => ({
    store,
    layout: computeLayout(store),
    row: 3,
    top: 96,
    activeCol: -1,
    activeId: 'active',
    edit: null,
    hasEdits: false,
    version: 0,
    onFinishEdit: vi.fn(),
    rowChecked: false,
    selC0: -1,
    selC1: -1,
    rowNew: false,
    findMask: 0,
    findCol: -1,
    ...over,
  });

  const cells = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('[role="gridcell"]'));

  it('a row with no find props draws plain cells', () => {
    const store = createCrtStore(makeTable(5));
    const { container } = render(<GridRow {...baseProps(store)} />);
    expect(cells(container).map((c) => c.className)).toEqual([CELL_CLASS[1], CELL_CLASS[0], CELL_CLASS[0]]);
  });

  it('flags the cells of the mask as matches and the find column as the current match', () => {
    const store = createCrtStore(makeTable(5));
    const { container } = render(<GridRow {...baseProps(store, { findMask: 0b110, findCol: 2 })} />);
    expect(cells(container).map((c) => c.className)).toEqual([
      CELL_CLASS[1],
      CELL_CLASS[FLAG_MATCH],
      CELL_CLASS[FLAG_MATCH_CURRENT],
    ]);
  });

  it('the current match is flagged even when the mask does not have its bit', () => {
    const store = createCrtStore(makeTable(5));
    const { container } = render(<GridRow {...baseProps(store, { findMask: 0, findCol: 1 })} />);
    expect(cells(container)[1].className).toBe(CELL_CLASS[FLAG_MATCH_CURRENT]);
  });

  it('combines with the active cell and the frozen column', () => {
    const store = createCrtStore(makeTable(5));
    const { container } = render(<GridRow {...baseProps(store, { activeCol: 0, findMask: 0b1, findCol: 0 })} />);
    expect(cells(container)[0].className).toBe(CELL_CLASS[1 | 2 | FLAG_MATCH_CURRENT]);
  });

  it('is not drawn again for the same numbers, and is drawn again when the mask or the current column changes', () => {
    const store = createCrtStore(makeTable(5));
    const props = baseProps(store, { findMask: 0b10 });
    const { rerender } = render(<GridRow {...props} />);
    const spy = vi.spyOn(store, 'getCell');
    rerender(<GridRow {...props} findMask={0b10} findCol={-1} />);
    expect(spy).not.toHaveBeenCalled();
    rerender(<GridRow {...props} findMask={0b110} />);
    expect(spy).toHaveBeenCalled();
    spy.mockClear();
    rerender(<GridRow {...props} findMask={0b110} findCol={2} />);
    expect(spy).toHaveBeenCalled();
    spy.mockClear();
    rerender(<GridRow {...props} findMask={0b110} findCol={2} />);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('the mounted grid', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(32 + 10 * 32);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mount = (store: CrtStore, props: Partial<React.ComponentProps<typeof CrtGrid>> = {}) => {
    const ref = createRef<CrtGridHandle>();
    const utils = render(<CrtGrid ref={ref} store={store} ariaLabel="Codes" {...props} />);
    return { ...utils, ref, grid: screen.getByRole('grid') };
  };

  const cell = (grid: HTMLElement, row: number, col: number) =>
    grid.querySelector<HTMLElement>(`[role="row"][data-r="${row}"] [data-c="${col}"]`) as HTMLElement;

  const highlight = (masks: Array<[number, number]>, current: { row: number; col: number } | null): CrtFindHighlight => ({
    masks: new Map(masks),
    current,
  });

  describe('highlights', () => {
    it('draws the match and current match classes from the highlight it is given', () => {
      const store = createCrtStore(makeTable(30));
      const { grid } = mount(store, { find: highlight([[1, 0b010], [2, 0b101]], { row: 2, col: 2 }) });
      expect(cell(grid, 1, 1)).toHaveClass('boomi-crt-cell--match');
      expect(cell(grid, 1, 1)).not.toHaveClass('boomi-crt-cell--match-current');
      expect(cell(grid, 2, 0)).toHaveClass('boomi-crt-cell--match');
      expect(cell(grid, 2, 1)).not.toHaveClass('boomi-crt-cell--match');
      expect(cell(grid, 2, 2)).toHaveClass('boomi-crt-cell--match', 'boomi-crt-cell--match-current');
      expect(grid.querySelectorAll('.boomi-crt-cell--match-current')).toHaveLength(1);
      // One match in row 1 and two in row 2.
      expect(grid.querySelectorAll('.boomi-crt-cell--match')).toHaveLength(3);
    });

    it('draws nothing extra without a highlight', () => {
      const store = createCrtStore(makeTable(30));
      const { grid } = mount(store);
      expect(grid.querySelectorAll('.boomi-crt-cell--match')).toHaveLength(0);
    });

    it('follows a new highlight, and clears when it goes away', () => {
      const store = createCrtStore(makeTable(30));
      const { grid, rerender, ref } = mount(store, { find: highlight([[1, 0b010]], { row: 1, col: 1 }) });
      expect(cell(grid, 1, 1)).toHaveClass('boomi-crt-cell--match-current');
      rerender(<CrtGrid ref={ref} store={store} ariaLabel="Codes" find={highlight([[4, 0b001]], { row: 4, col: 0 })} />);
      expect(cell(grid, 1, 1)).not.toHaveClass('boomi-crt-cell--match');
      expect(cell(grid, 4, 0)).toHaveClass('boomi-crt-cell--match-current');
      rerender(<CrtGrid ref={ref} store={store} ariaLabel="Codes" />);
      expect(grid.querySelectorAll('.boomi-crt-cell--match')).toHaveLength(0);
    });

    it('only rows whose mask or current cell changed are drawn again', () => {
      const store = createCrtStore(makeTable(30));
      const first = highlight(
        [[1, 0b010], [2, 0b010], [3, 0b010]],
        { row: 1, col: 1 }
      );
      const { rerender, ref } = mount(store, { find: first });
      const spy = vi.spyOn(store, 'getCell');
      // Row 2 gets another column, row 3 stays, and the current match moves from row 1 to row 3.
      const second = highlight([[1, 0b010], [2, 0b110], [3, 0b010]], { row: 3, col: 1 });
      rerender(<CrtGrid ref={ref} store={store} ariaLabel="Codes" find={second} />);
      const rowsRead = new Set(spy.mock.calls.map((call) => call[0]));
      expect(Array.from(rowsRead).sort()).toEqual([1, 2, 3]);
      spy.mockClear();
      // The same numbers in a new object draw nothing: only the numbers are compared.
      const third = highlight([[1, 0b010], [2, 0b110], [3, 0b010]], { row: 3, col: 1 });
      rerender(<CrtGrid ref={ref} store={store} ariaLabel="Codes" find={third} />);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('the find keys', () => {
    it('are given to onFind, stopped and prevented', () => {
      const store = createCrtStore(makeTable(10));
      const onFind = vi.fn();
      const { grid } = mount(store, { onFind });
      grid.focus();
      const host = vi.fn();
      document.addEventListener('keydown', host);
      const results = [
        fireEvent.keyDown(grid, { key: 'f', ctrlKey: true }),
        fireEvent.keyDown(grid, { key: 'f', metaKey: true }),
        fireEvent.keyDown(grid, { key: 'F3' }),
        fireEvent.keyDown(grid, { key: 'F3', shiftKey: true }),
      ];
      document.removeEventListener('keydown', host);
      expect(results).toEqual([false, false, false, false]);
      expect(onFind.mock.calls).toEqual([['open'], ['open'], ['next'], ['prev']]);
      expect(host).not.toHaveBeenCalled();
    });

    it('work on an empty table', () => {
      const store = createCrtStore(makeTable(3));
      store.deleteRows([0, 1, 2]);
      const onFind = vi.fn();
      const { grid } = mount(store, { onFind });
      expect(fireEvent.keyDown(grid, { key: 'f', ctrlKey: true })).toBe(false);
      expect(onFind).toHaveBeenCalledWith('open');
    });

    it('are left alone when the screen is not listening', () => {
      const store = createCrtStore(makeTable(10));
      const { grid } = mount(store);
      const host = vi.fn();
      document.addEventListener('keydown', host);
      expect(fireEvent.keyDown(grid, { key: 'f', ctrlKey: true })).toBe(true);
      expect(fireEvent.keyDown(grid, { key: 'F3' })).toBe(true);
      document.removeEventListener('keydown', host);
      expect(host).toHaveBeenCalledTimes(2);
    });

    it('are not taken from an open cell editor', () => {
      const store = createCrtStore(makeTable(10));
      const onFind = vi.fn();
      const { grid } = mount(store, { onFind });
      grid.focus();
      fireEvent.keyDown(grid, { key: 'Enter' });
      const input = grid.querySelector('input.boomi-crt-cell-input') as HTMLInputElement;
      expect(fireEvent.keyDown(input, { key: 'f', ctrlKey: true })).toBe(true);
      expect(onFind).not.toHaveBeenCalled();
    });

    it('do not disturb the other keys', () => {
      const store = createCrtStore(makeTable(10));
      const onFind = vi.fn();
      const { grid } = mount(store, { onFind });
      grid.focus();
      fireEvent.keyDown(grid, { key: 'ArrowDown' });
      fireEvent.keyDown(grid, { key: 'f' });
      expect(onFind).not.toHaveBeenCalled();
      // A plain letter still starts an edit.
      expect(grid.querySelector('input.boomi-crt-cell-input')).not.toBeNull();
    });
  });

  describe('the handle', () => {
    it('showCell makes the cell active without taking focus', () => {
      const store = createCrtStore(makeTable(30));
      const { grid, ref } = mount(store);
      const outside = document.createElement('input');
      document.body.appendChild(outside);
      outside.focus();
      act(() => ref.current?.showCell(7, 2));
      expect(grid.querySelector('.boomi-crt-cell--active')).toBe(cell(grid, 7, 2));
      expect(outside).toHaveFocus();
      expect(ref.current?.activeCell()).toEqual({ row: 7, col: 2 });
      outside.remove();
    });

    it('showCell keeps ticked rows ticked, like any keyboard move', () => {
      const store = createCrtStore(makeTable(30));
      const { grid, ref } = mount(store);
      grid.focus();
      fireEvent.keyDown(grid, { key: ' ' });
      expect(grid.querySelector('[role="row"][data-r="0"]')).toHaveAttribute('aria-selected', 'true');
      act(() => ref.current?.showCell(5, 1));
      expect(grid.querySelector('[role="row"][data-r="0"]')).toHaveAttribute('aria-selected', 'true');
      expect(ref.current?.activeCell()).toEqual({ row: 5, col: 1 });
    });

    it('showCell ignores a cell that is not in the table', () => {
      const store = createCrtStore(makeTable(5));
      const { ref } = mount(store);
      act(() => ref.current?.showCell(2, 1));
      act(() => ref.current?.showCell(9, 1));
      act(() => ref.current?.showCell(1, 7));
      act(() => ref.current?.showCell(-1, 0));
      expect(ref.current?.activeCell()).toEqual({ row: 2, col: 1 });
    });

    it('activeCell starts at the top left and follows the mouse and the keyboard', () => {
      const store = createCrtStore(makeTable(30));
      const { grid, ref } = mount(store);
      expect(ref.current?.activeCell()).toEqual({ row: 0, col: 0 });
      grid.focus();
      fireEvent.keyDown(grid, { key: 'ArrowDown' });
      fireEvent.keyDown(grid, { key: 'ArrowRight' });
      expect(ref.current?.activeCell()).toEqual({ row: 1, col: 1 });
    });

    it('activeCell is pulled back inside a table that shrank', () => {
      const store = createCrtStore(makeTable(30));
      const { ref } = mount(store);
      act(() => ref.current?.showCell(20, 1));
      act(() => void store.deleteRows(Array.from({ length: 20 }, (_, i) => i + 10)));
      expect(ref.current?.activeCell()).toEqual({ row: 9, col: 1 });
    });

    it('commitEdit commits an open editor and closes it', () => {
      const store = createCrtStore(makeTable(5));
      const { grid, ref } = mount(store);
      grid.focus();
      fireEvent.keyDown(grid, { key: 'Enter' });
      const input = grid.querySelector('input.boomi-crt-cell-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'typed' } });
      act(() => ref.current?.commitEdit());
      expect(store.getCell(0, 0)).toBe('typed');
      expect(grid.querySelector('input.boomi-crt-cell-input')).toBeNull();
    });

    it('commitEdit with no editor open does nothing', () => {
      const store = createCrtStore(makeTable(5));
      const { ref } = mount(store);
      act(() => ref.current?.commitEdit());
      expect(store.canUndo()).toBe(false);
    });

    it('showCell commits an open editor first, so its text is not lost', () => {
      const store = createCrtStore(makeTable(30));
      const { grid, ref } = mount(store);
      grid.focus();
      fireEvent.keyDown(grid, { key: 'Enter' });
      const input = grid.querySelector('input.boomi-crt-cell-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'typed' } });
      act(() => ref.current?.showCell(6, 1));
      expect(store.getCell(0, 0)).toBe('typed');
      expect(grid.querySelector('input.boomi-crt-cell-input')).toBeNull();
      expect(ref.current?.activeCell()).toEqual({ row: 6, col: 1 });
    });
  });
});
