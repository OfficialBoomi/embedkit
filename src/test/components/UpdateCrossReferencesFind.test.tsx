/**
 * @file UpdateCrossReferencesFind.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Find and replace through the whole screen: the real grid, toolbar, find row and picker over real
 * stores, with only the plugin context, the dialogs and the page frame replaced. It covers the
 * wiring that the hook and the row tests cannot: Ctrl+F and F3 from the grid and from the
 * toolbar, the live search drawing highlight classes on the grid cells, the active cell following
 * the current match without focus leaving the find box, Replace and Replace all as one undo step
 * each, a table that cannot be edited, the query surviving a table switch, a cell edit or an undo
 * refreshing the matches, and Escape closing the row without leaving full screen.
 *
 * jsdom has no layout, so the box sizes are faked to let the virtualized grid draw its rows, and
 * only rows near the top are drawn (a scroll never fires). Not covered here, and only checkable in
 * a browser: the colours of the highlight and of the current match in the three themes, that
 * the grid really scrolls to a match that is far down the table, and where focus lands after a
 * real mouse press.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

const ctx = vi.hoisted(() => ({
  boomiConfig: {} as Record<string, unknown>,
  renderComponent: vi.fn(),
}));
const confirm = vi.hoisted(() => vi.fn());

vi.mock('../../context/pluginContext', () => ({
  usePlugin: () => ctx,
}));
vi.mock('../../hooks/useDialogs', () => ({
  useDialogs: () => ({ confirm, alert: vi.fn() }),
}));
vi.mock('../../components/core/Page', () => ({
  default: ({ bodyContent }: { bodyContent: React.ReactNode }) => <div>{bodyContent}</div>,
}));
vi.mock('../../components/ui/Dialog', () => ({
  default: () => null,
}));

import UpdateCrossReferences from '../../components/integration/UpdateCrossReferences';
import { registerCrtDataSource } from '../../utils/crt/crtDataSource';
import type { CrtTableData } from '../../utils/crt/crtTypes';

const integration = { id: 'ipi-1', integrationPackName: 'Pack' } as never;

const ROWS = 30;
const codes = Array.from({ length: ROWS }, (_, r) => [`k${r}`, `v${r}`, `w${r}`]);

// 'A Codes' sorts first, so it is the table that is selected on load. It has the customer's rows, so it is editable.
const editable: CrtTableData = {
  id: 'codes',
  name: 'A Codes',
  processId: 'p1',
  processName: 'Store Sync',
  matchType: 'exact',
  columns: ['code', 'value', 'other'],
  defaultRows: [],
  overrideRows: codes.map((r) => r.slice()),
};

// Read only: only the publisher's default rows, until Override is pressed.
const readOnly: CrtTableData = {
  id: 'defaults',
  name: 'B Defaults',
  processId: 'p1',
  processName: 'Store Sync',
  matchType: 'exact',
  columns: ['key', 'text'],
  defaultRows: [
    ['one', 'v1 first'],
    ['two', 'second'],
    ['three', 'v1 third'],
  ],
  overrideRows: null,
};

const DEBOUNCE = 200;

const mount = async (tables: CrtTableData[] = [editable, readOnly]) => {
  registerCrtDataSource({ listTables: async () => tables });
  const utils = render(<UpdateCrossReferences componentKey="k" integration={integration} />);
  await screen.findByRole('grid');
  // The search is debounced, so the rest of each test runs on a clock it controls.
  vi.useFakeTimers();
  return utils;
};

const grid = () => screen.getByRole('grid');
const findInput = () => screen.getByRole('textbox', { name: 'Find' }) as HTMLInputElement;
const replaceInput = () => screen.getByRole('textbox', { name: 'Replace with' }) as HTMLInputElement;
const findButton = () => screen.getByRole('button', { name: 'Find' });
const settle = (ms = DEBOUNCE) => act(() => void vi.advanceTimersByTime(ms));

const matchTexts = () =>
  Array.from(grid().querySelectorAll('.boomi-crt-cell--match')).map((c) => c.textContent);
const currentTexts = () =>
  Array.from(grid().querySelectorAll('.boomi-crt-cell--match-current')).map((c) => c.textContent);
const activeText = () => grid().querySelector('.boomi-crt-cell--active')?.textContent;
const counter = () => within(screen.getByRole('search')).getByRole('status');
const cellOf = (row: number, col: number) =>
  grid().querySelector<HTMLElement>(`[role="row"][data-r="${row}"] [data-c="${col}"]`) as HTMLElement;

const openFind = () => {
  grid().focus();
  act(() => {
    fireEvent.keyDown(grid(), { key: 'f', ctrlKey: true });
  });
};

const typeQuery = (q: string) => {
  fireEvent.change(findInput(), { target: { value: q } });
  settle();
};

const clickCell = (row: number, col: number) => {
  act(() => {
    fireEvent.mouseDown(cellOf(row, col), { button: 0 });
    fireEvent.mouseUp(document);
  });
};

describe('find and replace on the screen', () => {
  beforeEach(() => {
    // Rows are 32 px and the header 32 px: ten rows are visible, and twelve more are drawn as overscan.
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(32 + 10 * 32);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
    ctx.boomiConfig = {};
    confirm.mockReset();
    confirm.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('opening', () => {
    it('shows no find row at first, and a Find button that is not pressed', async () => {
      await mount();
      expect(screen.queryByRole('search')).toBeNull();
      expect(findButton()).toHaveAttribute('aria-pressed', 'false');
    });

    it('Ctrl+F on the grid opens the row with the cursor in the find box, and stops the browser find', async () => {
      await mount();
      grid().focus();
      const host = vi.fn();
      document.addEventListener('keydown', host);
      let allowed = true;
      act(() => {
        allowed = fireEvent.keyDown(grid(), { key: 'f', ctrlKey: true });
      });
      document.removeEventListener('keydown', host);
      expect(allowed).toBe(false);
      expect(host).not.toHaveBeenCalled();
      expect(screen.getByRole('search')).toBeInTheDocument();
      expect(findInput()).toHaveFocus();
      expect(findButton()).toHaveAttribute('aria-pressed', 'true');
    });

    it('Cmd+F works the same', async () => {
      await mount();
      grid().focus();
      act(() => {
        fireEvent.keyDown(grid(), { key: 'f', metaKey: true });
      });
      expect(findInput()).toHaveFocus();
    });

    it('Ctrl+F while a toolbar button has focus opens it too', async () => {
      await mount();
      const full = screen.getByRole('button', { name: 'Full screen' });
      full.focus();
      const host = vi.fn();
      document.addEventListener('keydown', host);
      let allowed = true;
      act(() => {
        allowed = fireEvent.keyDown(full, { key: 'f', ctrlKey: true });
      });
      document.removeEventListener('keydown', host);
      expect(allowed).toBe(false);
      expect(host).not.toHaveBeenCalled();
      expect(findInput()).toHaveFocus();
    });

    it('the Find button opens the row and closes it again', async () => {
      await mount();
      act(() => {
        fireEvent.click(findButton());
      });
      expect(screen.getByRole('search')).toBeInTheDocument();
      expect(findInput()).toHaveFocus();
      act(() => {
        fireEvent.click(findButton());
      });
      expect(screen.queryByRole('search')).toBeNull();
      expect(grid()).toHaveFocus();
    });

    it('Ctrl+F with the row already open selects the text in the find box', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      grid().focus();
      act(() => {
        fireEvent.keyDown(grid(), { key: 'f', ctrlKey: true });
      });
      expect(findInput()).toHaveFocus();
      expect(findInput().selectionStart).toBe(0);
      expect(findInput().selectionEnd).toBe(2);
    });

    it('the row is the third line of the toolbar and holds the find controls', async () => {
      await mount();
      openFind();
      const toolbar = screen.getByRole('toolbar', { name: 'Table actions' });
      expect(toolbar.querySelectorAll('.boomi-crt-tools-line')).toHaveLength(2);
      expect(toolbar.lastElementChild).toBe(screen.getByRole('search'));
      expect(screen.getByRole('button', { name: 'Replace all' })).toBeInTheDocument();
    });
  });

  describe('live search', () => {
    it('highlights every matching cell and outlines the current one, after the debounce', async () => {
      await mount();
      openFind();
      fireEvent.change(findInput(), { target: { value: 'v1' } });
      settle(DEBOUNCE - 1);
      expect(matchTexts()).toEqual([]);
      settle(1);
      // v1 and v10 to v19, all in the value column.
      expect(matchTexts()).toEqual(['v1', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19']);
      expect(currentTexts()).toEqual(['v1']);
      expect(counter()).toHaveTextContent('1 of 11');
    });

    it('moves the active cell to the current match and leaves focus in the find box', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      expect(activeText()).toBe('v1');
      expect(findInput()).toHaveFocus();
    });

    it('the first match is the first one at or after the active cell', async () => {
      await mount();
      clickCell(12, 0);
      openFind();
      typeQuery('v1');
      expect(currentTexts()).toEqual(['v12']);
      // v1, v10, v11 come before it in reading order, so v12 is the fourth match.
      expect(counter()).toHaveTextContent('4 of 11');
      expect(activeText()).toBe('v12');
    });

    it('a query with no match says so and highlights nothing', async () => {
      await mount();
      openFind();
      typeQuery('nothing');
      expect(counter()).toHaveTextContent('No matches');
      expect(matchTexts()).toEqual([]);
      expect(screen.getByRole('button', { name: 'Replace all' })).toBeDisabled();
    });

    it('an invalid regular expression is flagged and highlights nothing', async () => {
      await mount();
      openFind();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Regex' }));
      });
      typeQuery('(');
      expect(findInput()).toHaveAttribute('aria-invalid', 'true');
      expect(counter()).toHaveTextContent('Invalid regular expression');
      expect(matchTexts()).toEqual([]);
    });

    it('the toggles change what is highlighted', async () => {
      await mount();
      openFind();
      typeQuery('V1');
      expect(matchTexts()).toHaveLength(11);
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Match case' }));
      });
      settle();
      expect(matchTexts()).toEqual([]);
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Match case' }));
        fireEvent.click(screen.getByRole('button', { name: 'Whole cell' }));
      });
      settle();
      // Whole cell, ignoring case: only the cell that is exactly v1 (the query is V1).
      expect(matchTexts()).toEqual(['v1']);
      typeQuery('v');
      expect(matchTexts()).toEqual([]);
    });

    it('every column is searched', async () => {
      await mount();
      openFind();
      typeQuery('w2');
      expect(matchTexts()).toEqual(['w2', 'w20', 'w21']);
    });

    it('never hides a row: the grid keeps drawing all of them', async () => {
      await mount();
      const before = grid().querySelectorAll('[role="row"][data-r]').length;
      openFind();
      typeQuery('v1');
      expect(grid().querySelectorAll('[role="row"][data-r]').length).toBe(before);
    });
  });

  describe('stepping', () => {
    it('Enter and Shift+Enter in the find box step with wrap, and focus stays put', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      act(() => {
        fireEvent.keyDown(findInput(), { key: 'Enter' });
      });
      expect(currentTexts()).toEqual(['v10']);
      expect(activeText()).toBe('v10');
      expect(counter()).toHaveTextContent('2 of 11');
      act(() => {
        fireEvent.keyDown(findInput(), { key: 'Enter', shiftKey: true });
        fireEvent.keyDown(findInput(), { key: 'Enter', shiftKey: true });
      });
      // Back past the first match wraps to the last.
      expect(currentTexts()).toEqual(['v19']);
      expect(counter()).toHaveTextContent('11 of 11');
      expect(findInput()).toHaveFocus();
    });

    it('the next and previous buttons step', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
      });
      expect(currentTexts()).toEqual(['v10']);
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Previous match' }));
      });
      expect(currentTexts()).toEqual(['v1']);
    });

    it('F3 and Shift+F3 step from the grid, and stop the browser find', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      grid().focus();
      let allowed = true;
      act(() => {
        allowed = fireEvent.keyDown(grid(), { key: 'F3' });
      });
      expect(allowed).toBe(false);
      expect(currentTexts()).toEqual(['v10']);
      expect(grid()).toHaveFocus();
      act(() => {
        fireEvent.keyDown(grid(), { key: 'F3', shiftKey: true });
      });
      expect(currentTexts()).toEqual(['v1']);
    });

    it('F3 steps from the find box too', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      act(() => {
        fireEvent.keyDown(findInput(), { key: 'F3' });
      });
      expect(currentTexts()).toEqual(['v10']);
      expect(findInput()).toHaveFocus();
    });

    it('F3 on the grid with the row closed opens it', async () => {
      await mount();
      grid().focus();
      act(() => {
        fireEvent.keyDown(grid(), { key: 'F3' });
      });
      expect(findInput()).toHaveFocus();
    });

    it('Enter right after typing searches first, then steps', async () => {
      await mount();
      openFind();
      fireEvent.change(findInput(), { target: { value: 'v1' } });
      act(() => {
        fireEvent.keyDown(findInput(), { key: 'Enter' });
      });
      expect(counter()).toHaveTextContent('2 of 11');
      expect(currentTexts()).toEqual(['v10']);
    });
  });

  describe('keys in the find row', () => {
    it('are kept from the host page', async () => {
      await mount();
      openFind();
      const host = vi.fn();
      document.addEventListener('keydown', host);
      for (const init of [{ key: 'a' }, { key: 'Enter' }, { key: 'ArrowDown' }, { key: 'z', ctrlKey: true }, { key: 'F3' }]) {
        fireEvent.keyDown(findInput(), init);
        fireEvent.keyDown(replaceInput(), init);
      }
      document.removeEventListener('keydown', host);
      expect(host).not.toHaveBeenCalled();
    });

    it('Ctrl+Z in a box is left to the browser text undo and does not undo the table', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));
      });
      expect(fireEvent.keyDown(findInput(), { key: 'z', ctrlKey: true })).toBe(true);
      expect(counter()).not.toHaveTextContent('Undid');
    });
  });

  describe('closing', () => {
    it('Escape closes the row, gives focus to the grid and clears the highlights', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      expect(matchTexts().length).toBeGreaterThan(0);
      act(() => {
        fireEvent.keyDown(findInput(), { key: 'Escape' });
      });
      expect(screen.queryByRole('search')).toBeNull();
      expect(grid()).toHaveFocus();
      expect(matchTexts()).toEqual([]);
      expect(currentTexts()).toEqual([]);
      expect(findButton()).toHaveAttribute('aria-pressed', 'false');
    });

    it('the close button closes it', async () => {
      await mount();
      openFind();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Close find' }));
      });
      expect(screen.queryByRole('search')).toBeNull();
      expect(grid()).toHaveFocus();
    });

    it('reopening starts with an empty query', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      act(() => {
        fireEvent.keyDown(findInput(), { key: 'Escape' });
      });
      openFind();
      expect(findInput()).toHaveValue('');
      expect(matchTexts()).toEqual([]);
    });

    it('Escape in the row does not also leave full screen', async () => {
      await mount();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
      });
      const workspace = () => document.querySelector('.boomi-crt-workspace') as HTMLElement;
      expect(workspace()).toHaveClass('boomi-crt-workspace--full');
      openFind();
      act(() => {
        fireEvent.keyDown(findInput(), { key: 'Escape' });
      });
      expect(screen.queryByRole('search')).toBeNull();
      expect(workspace()).toHaveClass('boomi-crt-workspace--full');
      // With the row gone, the next Escape (on the grid, nothing to collapse) leaves full screen as before.
      grid().focus();
      act(() => {
        fireEvent.keyDown(grid(), { key: 'Escape' });
      });
      expect(workspace()).not.toHaveClass('boomi-crt-workspace--full');
    });

    it('Escape on the grid with nothing to collapse leaves the find row open', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      grid().focus();
      act(() => {
        fireEvent.keyDown(grid(), { key: 'Escape' });
      });
      expect(screen.getByRole('search')).toBeInTheDocument();
      expect(matchTexts().length).toBeGreaterThan(0);
    });

    it('the find row works in full screen', async () => {
      await mount();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
      });
      openFind();
      typeQuery('v1');
      expect(counter()).toHaveTextContent('1 of 11');
    });
  });

  describe('Replace', () => {
    it('replaces the current match as one undo step and moves to the next', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      fireEvent.change(replaceInput(), { target: { value: 'X' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
      });
      expect(cellOf(1, 1).textContent).toBe('X');
      expect(cellOf(2, 1).textContent).toBe('v2');
      expect(currentTexts()).toEqual(['v10']);
      expect(counter()).toHaveTextContent('1 of 10');
      expect(activeText()).toBe('v10');
      // One step: a single Undo from the grid takes it back.
      grid().focus();
      act(() => {
        fireEvent.keyDown(grid(), { key: 'z', ctrlKey: true });
      });
      expect(cellOf(1, 1).textContent).toBe('v1');
      expect(screen.getByText('Undid: Replace')).toBeInTheDocument();
    });

    it('Enter in the replace box replaces', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      fireEvent.change(replaceInput(), { target: { value: 'X' } });
      act(() => {
        fireEvent.keyDown(replaceInput(), { key: 'Enter' });
      });
      expect(cellOf(1, 1).textContent).toBe('X');
    });

    it('the undo notice names the step', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      fireEvent.change(replaceInput(), { target: { value: 'X' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
      });
      expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute('title', expect.stringContaining('Undo: Replace'));
    });
  });

  describe('Replace all', () => {
    it('replaces every match as one undo step and says how many cells', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      fireEvent.change(replaceInput(), { target: { value: 'X' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));
      });
      expect(screen.getByText('Replaced 11 cells')).toBeInTheDocument();
      expect(cellOf(1, 1).textContent).toBe('X');
      expect(cellOf(19, 1).textContent).toBe('X9');
      expect(cellOf(2, 1).textContent).toBe('v2');
      expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute('title', expect.stringContaining('Undo: Replace all'));
      expect(counter()).toHaveTextContent('No matches');
      expect(matchTexts()).toEqual([]);
      grid().focus();
      act(() => {
        fireEvent.keyDown(grid(), { key: 'z', ctrlKey: true });
      });
      expect(screen.getByText('Undid: Replace all')).toBeInTheDocument();
      expect(cellOf(1, 1).textContent).toBe('v1');
      expect(cellOf(19, 1).textContent).toBe('v19');
      // The undo changed the table, and the highlights come back once things settle.
      settle();
      expect(counter()).toHaveTextContent(/of 11$/);
      expect(matchTexts()).toHaveLength(11);
    });
  });

  describe('a table that cannot be edited', () => {
    const switchTo = (name: string) => {
      act(() => {
        fireEvent.click(screen.getAllByRole('button', { name: /^Table\b/ })[0]);
      });
      const option = screen.getAllByRole('option').find((o) => within(o).queryByText(name) !== null) as HTMLElement;
      act(() => {
        fireEvent.click(option);
      });
    };

    it('searches it, but Replace and Replace all are off, with the reason in their titles', async () => {
      await mount([readOnly]);
      openFind();
      typeQuery('v1');
      expect(matchTexts()).toEqual(['v1 first', 'v1 third']);
      const replace = screen.getByRole('button', { name: 'Replace' });
      const all = screen.getByRole('button', { name: 'Replace all' });
      expect(replace).toBeDisabled();
      expect(all).toBeDisabled();
      expect(replace).toHaveAttribute('title', 'Press Override to edit');
      expect(all).toHaveAttribute('title', 'Press Override to edit');
    });

    it('Enter in the replace box says the table is read only and changes nothing', async () => {
      await mount([readOnly]);
      openFind();
      typeQuery('v1');
      fireEvent.change(replaceInput(), { target: { value: 'X' } });
      act(() => {
        fireEvent.keyDown(replaceInput(), { key: 'Enter' });
      });
      expect(screen.getByText('Read only. Press Override to edit.')).toBeInTheDocument();
      expect(cellOf(0, 1).textContent).toBe('v1 first');
    });

    it('Replace turns on once the table is overridden', async () => {
      await mount([readOnly]);
      openFind();
      typeQuery('v1');
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Override' }));
      });
      expect(screen.getByRole('button', { name: 'Replace' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Replace all' })).toBeEnabled();
    });

    it('keeps the query and the options when another table is picked, and searches that table', async () => {
      await mount();
      openFind();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Match case' }));
      });
      typeQuery('v1');
      expect(matchTexts()).toHaveLength(11);
      switchTo('B Defaults');
      expect(screen.getByRole('search')).toBeInTheDocument();
      expect(findInput()).toHaveValue('v1');
      expect(screen.getByRole('button', { name: 'Match case' })).toHaveAttribute('aria-pressed', 'true');
      // Nothing of the first table is drawn on the second while the new search waits.
      expect(matchTexts()).toEqual([]);
      settle();
      expect(matchTexts()).toEqual(['v1 first', 'v1 third']);
      expect(counter()).toHaveTextContent('1 of 2');
      expect(screen.getByRole('button', { name: 'Replace' })).toBeDisabled();
      switchTo('A Codes');
      settle();
      expect(matchTexts()).toHaveLength(11);
      expect(screen.getByRole('button', { name: 'Replace' })).toBeEnabled();
    });
  });

  describe('the table changes under the search', () => {
    it('an edit in the grid refreshes the matches after the debounce, without moving the cursor', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      clickCell(5, 1);
      grid().focus();
      act(() => {
        fireEvent.keyDown(grid(), { key: 'Enter' });
      });
      const input = grid().querySelector('input.boomi-crt-cell-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'has v1 in it' } });
      act(() => {
        fireEvent.keyDown(input, { key: 'Enter' });
      });
      // The edit is committed and the cursor moved down; the highlight has not caught up yet.
      expect(cellOf(5, 1).textContent).toBe('has v1 in it');
      expect(cellOf(5, 1)).not.toHaveClass('boomi-crt-cell--match');
      settle(DEBOUNCE - 1);
      expect(cellOf(5, 1)).not.toHaveClass('boomi-crt-cell--match');
      settle(1);
      expect(cellOf(5, 1)).toHaveClass('boomi-crt-cell--match');
      expect(counter()).toHaveTextContent(/of 12$/);
      expect(activeText()).toBe('v6');
    });

    it('an undo refreshes the matches too', async () => {
      await mount();
      openFind();
      typeQuery('v1');
      fireEvent.change(replaceInput(), { target: { value: 'X' } });
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Replace all' }));
      });
      expect(matchTexts()).toEqual([]);
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      });
      settle();
      expect(matchTexts()).toHaveLength(11);
    });
  });
});
