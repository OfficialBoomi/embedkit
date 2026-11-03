/**
 * @file UpdateCrossReferencesWarnings.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Key warnings through the whole screen: the real grid, toolbar and picker over real stores, with only
 * the plugin context, the dialogs and the page frame replaced. It covers the wiring that the helper and
 * row tests cannot: the chips in the info row (and in the full screen caption), none for a clean table
 * or a table that is not editable, the chips following an edit and an undo, a table switch, and a chip
 * moving the cursor to column 0 of the next flagged row (wrapping, from the active cell, with focus
 * landing on the grid and an open editor committed first).
 *
 * jsdom has no layout, so the box sizes are faked to let the virtualized grid draw its rows, and only
 * rows near the top are drawn. Not covered here, and only checkable in a browser: the colours of the
 * chips and of the warning style in the three themes, that the grid really scrolls to a flagged row
 * that is far down a long table, and how the chips wrap in a narrow window.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

// Rows 1 and 7 are blank, rows 3 and 5 share a key (the check ignores case). All are within the rows jsdom draws.
const WARNED_KEYS = [
  'k0', '', 'k2', 'dup', 'k4', 'DUP', 'k6', '  ', 'k8', 'k9',
  'k10', 'k11', 'k12', 'k13', 'k14', 'k15', 'k16', 'k17', 'k18', 'k19',
];

const rowsOf = (keys: string[]): string[][] => keys.map((k, r) => [k, `v${r}`]);

const warned: CrtTableData = {
  id: 'warned',
  name: 'A Warned',
  processId: 'p1',
  processName: 'Store Sync',
  matchType: 'exact',
  columns: ['code', 'value'],
  defaultRows: [],
  overrideRows: rowsOf(WARNED_KEYS),
};

const clean: CrtTableData = {
  id: 'clean',
  name: 'B Clean',
  processId: 'p1',
  processName: 'Store Sync',
  matchType: 'exact',
  columns: ['code', 'value'],
  defaultRows: [],
  overrideRows: rowsOf(['a', 'b', 'c', 'd']),
};

// Only the publisher's rows, until Override is pressed. They have a duplicate and a blank key.
const readOnly: CrtTableData = {
  id: 'defaults',
  name: 'C Defaults',
  processId: 'p1',
  processName: 'Store Sync',
  matchType: 'exact',
  columns: ['code', 'value'],
  defaultRows: rowsOf(['x', 'x', '']),
  overrideRows: null,
};

const mount = async (tables: CrtTableData[] = [warned, clean, readOnly]) => {
  registerCrtDataSource({ listTables: async () => tables });
  const utils = render(<UpdateCrossReferences componentKey="k" integration={integration} />);
  await screen.findByRole('grid');
  return utils;
};

const grid = () => screen.getByRole('grid');
const cellOf = (row: number, col: number) =>
  grid().querySelector<HTMLElement>(`[role="row"][data-r="${row}"] [data-c="${col}"]`) as HTMLElement;
const chip = (name: string | RegExp) => screen.getByRole('button', { name });
const queryChips = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.boomi-crt-chip--warn')).map((c) => c.textContent);
const infoRow = () => document.querySelector('.boomi-crt-info') as HTMLElement;

const activeCell = () => {
  const el = grid().querySelector('.boomi-crt-cell--active');
  return el ? { row: Number(el.parentElement?.getAttribute('data-r')), col: Number(el.getAttribute('data-c')) } : null;
};
const warnedRows = () =>
  Array.from(grid().querySelectorAll('.boomi-crt-cell--warn')).map((el) => Number(el.parentElement?.getAttribute('data-r')));

const clickCell = (row: number, col: number) => {
  act(() => {
    fireEvent.mouseDown(cellOf(row, col), { button: 0 });
    fireEvent.mouseUp(document);
  });
};

/** Replaces the text of a cell the way a user does: Enter opens the editor, type, Enter commits. */
const typeInto = (row: number, col: number, value: string) => {
  clickCell(row, col);
  act(() => {
    fireEvent.keyDown(grid(), { key: 'Enter' });
  });
  const input = grid().querySelector('input.boomi-crt-cell-input') as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  act(() => {
    fireEvent.keyDown(input, { key: 'Enter' });
  });
};

const user = () => userEvent.setup();
const pickerButton = () => screen.getAllByRole('button', { name: /^Table\b/ })[0];
const option = (name: string): HTMLElement =>
  screen.getAllByRole('option').find((o) => within(o).queryByText(name) !== null) as HTMLElement;

async function switchTo(u: ReturnType<typeof user>, name: string) {
  await u.click(pickerButton());
  await u.click(option(name));
}

describe('key warning chips', () => {
  beforeEach(() => {
    // Rows are 32 px and the header 32 px: ten rows are visible, and twelve more are drawn as overscan.
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(32 + 10 * 32);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
    ctx.boomiConfig = {};
    confirm.mockReset();
    confirm.mockResolvedValue(true);
  });

  afterEach(() => {
    registerCrtDataSource(null);
    vi.restoreAllMocks();
  });

  describe('what they say', () => {
    it('shows a blank chip and a duplicate chip, blank first, in the info row', async () => {
      await mount();
      expect(queryChips()).toEqual(['2 blank keys', '1 duplicate key']);
      expect(within(infoRow()).getByRole('button', { name: '2 blank keys' })).toBeInTheDocument();
      expect(within(infoRow()).getByRole('button', { name: '1 duplicate key' })).toBeInTheDocument();
    });

    it('puts the chips before the row count', async () => {
      await mount();
      const children = Array.from(infoRow().children);
      const count = children.findIndex((el) => el.classList.contains('boomi-crt-count'));
      const lastChip = children.map((el) => el.classList.contains('boomi-crt-chip--warn')).lastIndexOf(true);
      expect(lastChip).toBeGreaterThan(-1);
      expect(lastChip).toBeLessThan(count);
    });

    it('explains each chip in its tooltip', async () => {
      await mount();
      expect(chip('2 blank keys')).toHaveAttribute('title', expect.stringMatching(/next row with a blank key/));
      expect(chip('1 duplicate key')).toHaveAttribute('title', expect.stringMatching(/next row with a duplicate key/));
    });

    it('leaves the chips out of the markup for a clean table', async () => {
      await mount([clean]);
      expect(queryChips()).toEqual([]);
      expect(infoRow().querySelector('button')).toBeNull();
    });

    it('shows only the chip that applies', async () => {
      await mount([{ ...clean, overrideRows: rowsOf(['a', 'a', 'b']) }]);
      expect(queryChips()).toEqual(['1 duplicate key']);
    });

    it('marks the key cells of the flagged rows in the grid', async () => {
      await mount();
      expect(warnedRows()).toEqual([1, 3, 5, 7]);
    });
  });

  describe('a table that is not editable', () => {
    it('shows no chips and no warning style, but still shows edge spaces', async () => {
      await mount([{ ...readOnly, defaultRows: rowsOf(['x', 'x', '', ' y']) }]);
      expect(queryChips()).toEqual([]);
      expect(warnedRows()).toEqual([]);
      expect(cellOf(3, 0).querySelectorAll('.boomi-crt-ws')).toHaveLength(1);
    });

    it('shows the chips and the style once Override is pressed', async () => {
      await mount([readOnly]);
      expect(queryChips()).toEqual([]);
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Override' }));
      });
      expect(queryChips()).toEqual(['1 blank key', '1 duplicate key']);
      expect(warnedRows()).toEqual([0, 1, 2]);
    });

    it('takes the chips away again after Reset', async () => {
      await mount([readOnly]);
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Override' }));
      });
      expect(queryChips()).toHaveLength(2);
      confirm.mockResolvedValue(true);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
      });
      expect(queryChips()).toEqual([]);
      expect(warnedRows()).toEqual([]);
    });
  });

  describe('following the table', () => {
    it('updates after an edit: fixing a duplicate removes its chip, a new blank key counts', async () => {
      await mount();
      typeInto(3, 0, 'unique');
      expect(queryChips()).toEqual(['2 blank keys']);
      expect(warnedRows()).toEqual([1, 7]);
      typeInto(2, 0, '');
      expect(queryChips()).toEqual(['3 blank keys']);
    });

    it('updates after an undo', async () => {
      await mount();
      typeInto(3, 0, 'unique');
      expect(queryChips()).toEqual(['2 blank keys']);
      grid().focus();
      act(() => {
        fireEvent.keyDown(grid(), { key: 'z', ctrlKey: true });
      });
      expect(queryChips()).toEqual(['2 blank keys', '1 duplicate key']);
      expect(warnedRows()).toEqual([1, 3, 5, 7]);
    });

    it('updates after a row is added: a new empty row is a blank key', async () => {
      await mount([clean]);
      expect(queryChips()).toEqual([]);
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Add row' }));
      });
      expect(queryChips()).toEqual(['1 blank key']);
    });

    it('shows the warnings of the table that is selected after a switch', async () => {
      await mount();
      expect(queryChips()).toHaveLength(2);
      await switchTo(user(), 'B Clean');
      expect(queryChips()).toEqual([]);
      expect(warnedRows()).toEqual([]);
      await switchTo(user(), 'A Warned');
      expect(queryChips()).toEqual(['2 blank keys', '1 duplicate key']);
    });
  });

  describe('full screen', () => {
    it('shows the chips in the caption as well, since the info row is covered', async () => {
      await mount();
      expect(screen.getAllByRole('button', { name: '2 blank keys' })).toHaveLength(1);
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
      });
      const caption = document.querySelector('.boomi-crt-fs-caption') as HTMLElement;
      expect(within(caption).getByRole('button', { name: '2 blank keys' })).toBeInTheDocument();
      expect(within(caption).getByRole('button', { name: '1 duplicate key' })).toBeInTheDocument();
    });

    it('jumps from the caption chip too', async () => {
      await mount();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
      });
      const caption = document.querySelector('.boomi-crt-fs-caption') as HTMLElement;
      act(() => {
        fireEvent.click(within(caption).getByRole('button', { name: '1 duplicate key' }));
      });
      expect(activeCell()).toEqual({ row: 3, col: 0 });
      expect(grid()).toHaveFocus();
    });
  });

  describe('jumping', () => {
    it('the blank chip goes to column 0 of the next blank row, then the next, then wraps', async () => {
      await mount();
      act(() => {
        fireEvent.click(chip('2 blank keys'));
      });
      expect(activeCell()).toEqual({ row: 1, col: 0 });
      act(() => {
        fireEvent.click(chip('2 blank keys'));
      });
      expect(activeCell()).toEqual({ row: 7, col: 0 });
      act(() => {
        fireEvent.click(chip('2 blank keys'));
      });
      expect(activeCell()).toEqual({ row: 1, col: 0 });
    });

    it('the duplicate chip steps through the rows that share a key', async () => {
      await mount();
      const seen: number[] = [];
      for (let i = 0; i < 3; i++) {
        act(() => {
          fireEvent.click(chip('1 duplicate key'));
        });
        seen.push(activeCell()?.row ?? -1);
      }
      expect(seen).toEqual([3, 5, 3]);
    });

    it('starts from the active cell, not from the top', async () => {
      await mount();
      clickCell(4, 1);
      act(() => {
        fireEvent.click(chip('2 blank keys'));
      });
      expect(activeCell()).toEqual({ row: 7, col: 0 });
      clickCell(8, 1);
      act(() => {
        fireEvent.click(chip('2 blank keys'));
      });
      expect(activeCell()).toEqual({ row: 1, col: 0 });
    });

    it('moves to column 0 even when the cursor was in another column of the same row', async () => {
      await mount();
      clickCell(0, 1);
      act(() => {
        fireEvent.click(chip('2 blank keys'));
      });
      expect(activeCell()).toEqual({ row: 1, col: 0 });
    });

    it('gives the grid focus, so the keys work at once', async () => {
      await mount();
      chip('2 blank keys').focus();
      act(() => {
        fireEvent.click(chip('2 blank keys'));
      });
      expect(grid()).toHaveFocus();
      act(() => {
        fireEvent.keyDown(grid(), { key: 'ArrowDown' });
      });
      expect(activeCell()).toEqual({ row: 2, col: 0 });
    });

    it('lands on the only flagged row again when the cursor is already on it', async () => {
      await mount([{ ...clean, overrideRows: rowsOf(['a', '', 'b']) }]);
      act(() => {
        fireEvent.click(chip('1 blank key'));
      });
      expect(activeCell()).toEqual({ row: 1, col: 0 });
      act(() => {
        fireEvent.click(chip('1 blank key'));
      });
      expect(activeCell()).toEqual({ row: 1, col: 0 });
    });

    it('keeps ticked rows ticked, like any keyboard move', async () => {
      await mount();
      grid().focus();
      act(() => {
        fireEvent.keyDown(grid(), { key: ' ' });
      });
      expect(grid().querySelector('[role="row"][data-r="0"]')).toHaveAttribute('aria-selected', 'true');
      act(() => {
        fireEvent.click(chip('2 blank keys'));
      });
      expect(activeCell()).toEqual({ row: 1, col: 0 });
      expect(grid().querySelector('[role="row"][data-r="0"]')).toHaveAttribute('aria-selected', 'true');
    });

    it('commits an open cell editor before it moves', async () => {
      await mount();
      clickCell(2, 0);
      act(() => {
        fireEvent.keyDown(grid(), { key: 'Enter' });
      });
      const input = grid().querySelector('input.boomi-crt-cell-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'changed' } });
      act(() => {
        fireEvent.click(chip('2 blank keys'));
      });
      expect(grid().querySelector('input.boomi-crt-cell-input')).toBeNull();
      expect(cellOf(2, 0).textContent).toBe('changed');
      expect(activeCell()).toEqual({ row: 7, col: 0 });
    });
  });
});
