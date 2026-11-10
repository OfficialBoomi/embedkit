/**
 * @file UpdateCrossReferencesPlace.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * With the real grid (only the toolbar is a stand-in): after a save the user is still on the cell they
 * were on, and the scroll position is put back. The grid starts every new store from the top left, and the
 * screen puts the place back once the new store is shown, so this checks the two together, which the
 * stand-in grid of the other screen tests cannot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ctx = vi.hoisted(() => ({
  boomiConfig: {} as Record<string, unknown>,
  renderComponent: vi.fn(),
}));
const fetchTables = vi.hoisted(() => vi.fn());
const saveTable = vi.hoisted(() => vi.fn());

vi.mock('../../context/pluginContext', () => ({ usePlugin: () => ctx, usePluginOptional: () => ctx }));
vi.mock('../../hooks/useDialogs', () => ({ useDialogs: () => ({ confirm: vi.fn(async () => true), alert: vi.fn() }) }));
vi.mock('../../events.service', () => ({ emitEmbedKitEvent: vi.fn() }));
vi.mock('../../service/crossReferenceTables.service', () => ({
  useCrossReferenceTablesService: () => ({
    fetchCrossReferenceTables: fetchTables,
    saveCrossReferenceTable: saveTable,
    resetCrossReferenceTable: vi.fn(),
    fetchCrossReferenceHistory: vi.fn(async () => ({ environment: null, tables: [] })),
  }),
}));
vi.mock('../../components/core/Page', () => ({
  default: ({ bodyContent }: { bodyContent: React.ReactNode }) => <div>{bodyContent}</div>,
}));
vi.mock('../../components/ui/ToastNotification', () => ({
  default: ({ content }: { content: string }) => <div role="status">{content}</div>,
}));
vi.mock('../../components/integration/crt/CrtToolbar', () => ({
  default: ({ trailing }: { trailing?: React.ReactNode }) => <div>{trailing}</div>,
}));

import UpdateCrossReferences from '../../components/integration/UpdateCrossReferences';
import { registerCrtDataSource } from '../../utils/crt/crtDataSource';

const integration = { id: 'ipi-1', environmentId: 'env-1', integrationPackId: 'pack-1', integrationPackName: 'Pack' } as never;

const rows = Array.from({ length: 12 }, (_, r) => [`k${r}`, `v${r}`]);
const table = (over: Record<string, unknown> = {}) => ({
  id: 'id-alpha',
  name: 'Alpha',
  processId: 'p1',
  processName: 'Pack - Main',
  overridden: true,
  matchType: 'exact',
  columns: ['code', 'value'],
  defaultRows: [['a', '1']],
  overrideRows: rows,
  stamp: 'o12.mine',
  ...over,
});

beforeEach(() => {
  // jsdom has no layout: give the grid a size, or it draws no rows.
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(32 + 10 * 32);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
  fetchTables.mockReset();
  saveTable.mockReset();
});
afterEach(() => {
  registerCrtDataSource(null);
  vi.restoreAllMocks();
});

const activeText = (): string | null => {
  const grid = screen.getByRole('grid');
  const id = grid.getAttribute('aria-activedescendant');
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
};

describe('the real grid after a save', () => {
  it('keeps the active cell and the scroll position', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({ tables: [table()] });
    saveTable.mockResolvedValue({ processId: 'p1', tableId: 'id-alpha', overridden: true, rowCount: 12, stamp: 'o12.after' });
    render(<UpdateCrossReferences componentKey="k" integration={integration} onBack={vi.fn()} />);
    const grid = await screen.findByRole('grid');
    grid.focus();

    // Move to the second column of the fourth row, and type into it so there is something to save.
    for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowRight']) {
      fireEvent.keyDown(grid, { key });
    }
    expect(activeText()).toBe('v3');
    fireEvent.keyDown(grid, { key: 'Enter' });
    const input = grid.querySelector('input.boomi-crt-cell-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.blur(input);
    expect(activeText()).toBe('changed');
    act(() => {
      grid.scrollTop = 24;
      grid.scrollLeft = 3;
    });

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Table saved.');

    // The new store was built from what was saved, and the cursor is still on the same cell.
    await waitFor(() => expect(activeText()).toBe('changed'));
    expect(grid.scrollTop).toBe(24);
    expect(grid.scrollLeft).toBe(3);
  });
});
