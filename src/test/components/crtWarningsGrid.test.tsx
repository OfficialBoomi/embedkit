/**
 * @file crtWarningsGrid.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * What the grid draws for key warnings and edge spaces: the key warning flag in the class table, the
 * memoized row taking one `keyWarn` number (only column 0 is styled, and the row draws again only when
 * the number changes), plain text children for ordinary cells, markers for cells with whitespace at an
 * edge (in editable and read only tables alike), the real characters in the open editor, and the
 * mounted grid ignoring key warnings on a table that is not editable.
 *
 * The box sizes are faked so the virtualized grid draws rows in jsdom. Not covered here, and only
 * checkable in a browser: the colours of the warning style and of the markers in the three themes, how
 * the markers sit next to clipped text, and the native tooltips.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { checkKeys } from '../../utils/crt/crtWarnings';
import { createCrtStore, type CrtStore } from '../../utils/crt/crtStore';
import type { CrtTableData } from '../../utils/crt/crtTypes';
import CrtGrid from '../../components/integration/crt/CrtGrid';
import GridRow from '../../components/integration/crt/CrtGridRow';
import { CELL_CLASS, computeLayout, FLAG_KEY_WARN, FLAG_MATCH } from '../../components/integration/crt/gridLayout';

const makeTable = (keys: string[], overridden = true): CrtTableData => {
  const data = keys.map((k, r) => [k, `v${r}`, `w${r}`]);
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

const warningsOf = (store: CrtStore) => checkKeys((r, c) => store.getCell(r, c), store.rowCount());

const cells = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('[role="gridcell"]'));
const markers = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>('.boomi-crt-ws'));
const DOT = '·';

describe('the class table', () => {
  it('has a key warning flag that adds one class and leaves every earlier entry alone', () => {
    expect(FLAG_KEY_WARN).toBe(128);
    expect(CELL_CLASS).toHaveLength(256);
    expect(CELL_CLASS[FLAG_KEY_WARN]).toBe('boomi-crt-cell boomi-crt-cell--warn');
    expect(CELL_CLASS[FLAG_KEY_WARN | 1]).toBe('boomi-crt-cell boomi-crt-cell--frozen boomi-crt-cell--warn');
    for (let flags = 0; flags < 128; flags++) {
      expect(CELL_CLASS[flags]).not.toContain('warn');
      expect(CELL_CLASS[flags | FLAG_KEY_WARN]).toBe(`${CELL_CLASS[flags]} boomi-crt-cell--warn`);
    }
  });

  it('combines with the find flags', () => {
    expect(CELL_CLASS[FLAG_KEY_WARN | FLAG_MATCH | 1]).toBe(
      'boomi-crt-cell boomi-crt-cell--frozen boomi-crt-cell--match boomi-crt-cell--warn'
    );
  });
});

describe('GridRow with key warnings', () => {
  const baseProps = (store: CrtStore, over: Partial<React.ComponentProps<typeof GridRow>> = {}) => ({
    store,
    layout: computeLayout(store),
    row: 1,
    top: 32,
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

  it('draws plain cells when no key warning is given', () => {
    const store = createCrtStore(makeTable(['a', 'b', 'c']));
    const { container } = render(<GridRow {...baseProps(store)} />);
    expect(cells(container).map((c) => c.className)).toEqual([CELL_CLASS[1], CELL_CLASS[0], CELL_CLASS[0]]);
    expect(cells(container).map((c) => c.title)).toEqual(['', '', '']);
  });

  it('styles only the key cell of a flagged row, and titles it', () => {
    const store = createCrtStore(makeTable(['a', 'a', 'c']));
    const { container } = render(<GridRow {...baseProps(store, { keyWarn: 2 })} />);
    const [key, value, other] = cells(container);
    expect(key.className).toBe(CELL_CLASS[1 | FLAG_KEY_WARN]);
    expect(key).toHaveAttribute('title', 'Duplicate key (this key appears more than once)');
    expect(value.className).toBe(CELL_CLASS[0]);
    expect(other.className).toBe(CELL_CLASS[0]);
    expect(value).not.toHaveAttribute('title');
  });

  it('titles a blank key', () => {
    const store = createCrtStore(makeTable(['a', '', 'c']));
    const { container } = render(<GridRow {...baseProps(store, { keyWarn: 1 })} />);
    const key = cells(container)[0];
    expect(key).toHaveClass('boomi-crt-cell--warn');
    expect(key).toHaveAttribute('title', 'Blank key');
  });

  it('keeps the other flags on a flagged key cell', () => {
    const store = createCrtStore(makeTable(['a', 'a']));
    const { container } = render(<GridRow {...baseProps(store, { keyWarn: 2, activeCol: 0 })} />);
    expect(cells(container)[0].className).toBe(CELL_CLASS[1 | 2 | FLAG_KEY_WARN]);
  });

  it('is not drawn again for the same number, and is drawn again when the number changes', () => {
    const store = createCrtStore(makeTable(['a', 'a', 'c']));
    const props = baseProps(store, { keyWarn: 2 });
    const { rerender, container } = render(<GridRow {...props} />);
    const spy = vi.spyOn(store, 'getCell');
    rerender(<GridRow {...props} keyWarn={2} />);
    expect(spy).not.toHaveBeenCalled();
    rerender(<GridRow {...props} keyWarn={0} />);
    expect(spy).toHaveBeenCalled();
    expect(cells(container)[0]).not.toHaveClass('boomi-crt-cell--warn');
    spy.mockClear();
    rerender(<GridRow {...props} keyWarn={1} />);
    expect(spy).toHaveBeenCalled();
    expect(cells(container)[0]).toHaveClass('boomi-crt-cell--warn');
  });
});

describe('GridRow with edge spaces', () => {
  const rowProps = (store: CrtStore, row: number, over: Partial<React.ComponentProps<typeof GridRow>> = {}) => ({
    store,
    layout: computeLayout(store),
    row,
    top: 0,
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

  const storeOf = (keys: string[], overridden = true) => createCrtStore(makeTable(keys, overridden));

  it('renders a cell with no edge space as exactly one plain text node, as before', () => {
    const store = storeOf(['plain', 'a b c']);
    const { container } = render(<GridRow {...rowProps(store, 1)} />);
    const key = cells(container)[0];
    expect(key.childNodes).toHaveLength(1);
    expect(key.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(key.textContent).toBe('a b c');
    expect(key.querySelector('.boomi-crt-ws')).toBeNull();
    expect(key).not.toHaveAttribute('title');
  });

  it('marks a leading space', () => {
    const store = storeOf([' abc']);
    const { container } = render(<GridRow {...rowProps(store, 0)} />);
    const key = cells(container)[0];
    expect(markers(key).map((m) => m.textContent)).toEqual([DOT]);
    expect(key.textContent).toBe(`${DOT}abc`);
    expect(key).toHaveAttribute('title', 'Leading space');
  });

  it('marks a trailing space', () => {
    const store = storeOf(['abc ']);
    const { container } = render(<GridRow {...rowProps(store, 0)} />);
    const key = cells(container)[0];
    expect(markers(key).map((m) => m.textContent)).toEqual([DOT]);
    expect(key.textContent).toBe(`abc${DOT}`);
    expect(key).toHaveAttribute('title', 'Trailing space');
  });

  it('marks both edges with one dot per character and keeps the middle text', () => {
    const store = storeOf(['  a  b \t']);
    const { container } = render(<GridRow {...rowProps(store, 0)} />);
    const key = cells(container)[0];
    expect(markers(key).map((m) => m.textContent)).toEqual([DOT.repeat(2), DOT.repeat(2)]);
    expect(key.textContent).toBe(`${DOT}${DOT}a  b${DOT}${DOT}`);
    expect(key).toHaveAttribute('title', 'Leading and trailing space');
  });

  it('shows only markers for a cell of whitespace', () => {
    const store = storeOf(['   ']);
    const { container } = render(<GridRow {...rowProps(store, 0)} />);
    const key = cells(container)[0];
    expect(key.textContent).toBe(DOT.repeat(3));
    expect(markers(key)).toHaveLength(1);
    expect(key).toHaveAttribute('title', 'Only whitespace');
  });

  it('hides the markers from assistive technology', () => {
    const store = storeOf([' a ']);
    const { container } = render(<GridRow {...rowProps(store, 0)} />);
    for (const m of markers(cells(container)[0])) expect(m).toHaveAttribute('aria-hidden', 'true');
  });

  it('marks cells in every column, not only the key', () => {
    const store = createCrtStore({
      ...makeTable(['k']),
      overrideRows: [['k', ' v', 'w ']],
    });
    const { container } = render(<GridRow {...rowProps(store, 0)} />);
    const [key, value, other] = cells(container);
    expect(markers(key)).toHaveLength(0);
    expect(value.textContent).toBe(`${DOT}v`);
    expect(other.textContent).toBe(`w${DOT}`);
  });

  it('marks a read only table too', () => {
    const store = storeOf([' a', 'b '], false);
    expect(store.isEditable()).toBe(false);
    const { container } = render(<GridRow {...rowProps(store, 0)} />);
    expect(markers(cells(container)[0])).toHaveLength(1);
  });

  it('keeps an emoji whole next to a marker', () => {
    const store = storeOf(['\u{1F600} ']);
    const { container } = render(<GridRow {...rowProps(store, 0)} />);
    expect(cells(container)[0].textContent).toBe(`\u{1F600}${DOT}`);
  });

  it('adds the edge space note to the full text tooltip of a long cell', () => {
    const long = 'a long cell text that gets clipped ';
    const store = storeOf([long]);
    const { container } = render(<GridRow {...rowProps(store, 0)} />);
    expect(cells(container)[0]).toHaveAttribute('title', `${long}\nTrailing space`);
  });

  it('joins the key warning and the edge space note in the title', () => {
    const store = storeOf(['a ', 'a']);
    const { container } = render(<GridRow {...rowProps(store, 0, { keyWarn: 2 })} />);
    expect(cells(container)[0]).toHaveAttribute(
      'title',
      'Duplicate key (this key appears more than once)\nTrailing space'
    );
  });

  it('shows the real characters in the open editor and no markers', () => {
    const store = storeOf(['  a  ']);
    const edit = { store, row: 0, col: 0, mode: 'select-all' as const, initial: store.getCell(0, 0) };
    const { container } = render(<GridRow {...rowProps(store, 0, { edit, activeCol: 0 })} />);
    const input = container.querySelector('input.boomi-crt-cell-input') as HTMLInputElement;
    expect(input.value).toBe('  a  ');
    expect(cells(container)[0].querySelector('.boomi-crt-ws')).toBeNull();
    expect(cells(container)[0]).not.toHaveAttribute('title');
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

  const cell = (grid: HTMLElement, row: number, col: number) =>
    grid.querySelector<HTMLElement>(`[role="row"][data-r="${row}"] [data-c="${col}"]`) as HTMLElement;

  const KEYS = ['a', '', 'b', 'a', '   ', 'c', 'd'];

  it('flags the key cells of blank and duplicate rows and no others', () => {
    const store = createCrtStore(makeTable(KEYS));
    render(<CrtGrid store={store} ariaLabel="Codes" keyWarnings={warningsOf(store)} />);
    const grid = screen.getByRole('grid');
    const flagged = Array.from(grid.querySelectorAll('.boomi-crt-cell--warn')).map((el) =>
      Number(el.parentElement?.getAttribute('data-r'))
    );
    expect(flagged).toEqual([0, 1, 3, 4]);
    for (const el of Array.from(grid.querySelectorAll('.boomi-crt-cell--warn'))) {
      expect(el.getAttribute('data-c')).toBe('0');
    }
    expect(cell(grid, 1, 0)).toHaveAttribute('title', 'Blank key');
    expect(cell(grid, 4, 0)).toHaveAttribute('title', expect.stringContaining('Blank key'));
    expect(cell(grid, 0, 0)).toHaveAttribute('title', 'Duplicate key (this key appears more than once)');
    expect(cell(grid, 2, 0)).not.toHaveClass('boomi-crt-cell--warn');
  });

  it('draws no key warnings when none are given', () => {
    const store = createCrtStore(makeTable(KEYS));
    render(<CrtGrid store={store} ariaLabel="Codes" />);
    expect(screen.getByRole('grid').querySelectorAll('.boomi-crt-cell--warn')).toHaveLength(0);
  });

  it('draws no key warnings on a table that is not editable, even when given some', () => {
    const store = createCrtStore(makeTable(KEYS, false));
    render(<CrtGrid store={store} ariaLabel="Codes" keyWarnings={warningsOf(store)} />);
    expect(screen.getByRole('grid').querySelectorAll('.boomi-crt-cell--warn')).toHaveLength(0);
  });

  it('still marks edge spaces on a table that is not editable', () => {
    const store = createCrtStore(makeTable([' a', 'b '], false));
    render(<CrtGrid store={store} ariaLabel="Codes" />);
    const grid = screen.getByRole('grid');
    expect(markers(cell(grid, 0, 0))).toHaveLength(1);
    expect(markers(cell(grid, 1, 0))).toHaveLength(1);
  });

  it('follows new warnings, and the warning goes away after the edit that fixes it', () => {
    const store = createCrtStore(makeTable(['a', 'a', 'c']));
    const { rerender } = render(<CrtGrid store={store} ariaLabel="Codes" keyWarnings={warningsOf(store)} />);
    const grid = screen.getByRole('grid');
    expect(grid.querySelectorAll('.boomi-crt-cell--warn')).toHaveLength(2);
    act(() => void store.setCell(1, 0, 'b'));
    rerender(<CrtGrid store={store} ariaLabel="Codes" keyWarnings={warningsOf(store)} />);
    expect(grid.querySelectorAll('.boomi-crt-cell--warn')).toHaveLength(0);
  });

  it('turns the warnings off when Reset makes the table read only', () => {
    const table = makeTable(['a', 'a'], false);
    const store = createCrtStore(table);
    store.override();
    render(<CrtGrid store={store} ariaLabel="Codes" keyWarnings={warningsOf(store)} />);
    const grid = screen.getByRole('grid');
    expect(grid.querySelectorAll('.boomi-crt-cell--warn')).toHaveLength(2);
    act(() => store.reset());
    expect(grid.querySelectorAll('.boomi-crt-cell--warn')).toHaveLength(0);
  });

  it('opens the editor on the real characters of a cell with edge spaces', () => {
    const store = createCrtStore(makeTable(['  padded  ', 'b']));
    render(<CrtGrid store={store} ariaLabel="Codes" />);
    const grid = screen.getByRole('grid');
    grid.focus();
    expect(cell(grid, 0, 0).textContent).toBe(`${DOT}${DOT}padded${DOT}${DOT}`);
    fireEvent.keyDown(grid, { key: 'Enter' });
    const input = grid.querySelector('input.boomi-crt-cell-input') as HTMLInputElement;
    expect(input.value).toBe('  padded  ');
  });

  it('commits what was typed without the markers leaking into the value', () => {
    const store = createCrtStore(makeTable([' x ']));
    render(<CrtGrid store={store} ariaLabel="Codes" />);
    const grid = screen.getByRole('grid');
    grid.focus();
    fireEvent.keyDown(grid, { key: 'Enter' });
    const input = grid.querySelector('input.boomi-crt-cell-input') as HTMLInputElement;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(store.getCell(0, 0)).toBe(' x ');
    expect(store.canUndo()).toBe(false);
  });
});
