/**
 * @file UpdateCrossReferencesProcess.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The Process dropdown of the cross reference table screen: which process and table open first, a
 * process with no table listed but disabled, what opens when the process changes, the unsaved dot
 * on a process, and the screen states around it. The grid and the toolbar are small stand-ins, as
 * in the other screen tests; both pickers are the real ones.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ctx = vi.hoisted(() => ({
  boomiConfig: {} as Record<string, unknown>,
  renderComponent: vi.fn(),
}));
const confirm = vi.hoisted(() => vi.fn());

vi.mock('../../context/pluginContext', () => ({ usePlugin: () => ctx }));
vi.mock('../../hooks/useDialogs', () => ({ useDialogs: () => ({ confirm, alert: vi.fn() }) }));
vi.mock('../../components/core/Page', () => ({
  default: ({ bodyContent }: { bodyContent: React.ReactNode }) => <div>{bodyContent}</div>,
}));
vi.mock('../../components/ui/Dialog', () => ({
  default: ({ error }: { error?: { header: string } }) => (error ? <div role="alertdialog">{error.header}</div> : null),
}));
vi.mock('../../components/integration/crt/CrtToolbar', () => ({
  default: ({ trailing, onToggleFullScreen }: { trailing?: React.ReactNode; onToggleFullScreen: () => void }) => (
    <div>
      {trailing}
      <button type="button" onClick={onToggleFullScreen}>
        Toggle full screen
      </button>
    </div>
  ),
}));
vi.mock('../../components/integration/crt/CrtGrid', () => ({
  default: forwardRef<unknown, { store: import('../../utils/crt/crtStore').CrtStore; ariaLabel: string }>(
    ({ store, ariaLabel }, ref) => {
      useImperativeHandle(ref, () => ({ run: () => {} }), []);
      return (
        <div role="grid" tabIndex={0} aria-label={ariaLabel}>
          <button
            type="button"
            aria-label={`Edit ${ariaLabel}`}
            onClick={() => {
              store.override();
              store.setCell(0, 0, 'edited');
            }}
          />
        </div>
      );
    }
  ),
}));

import UpdateCrossReferences from '../../components/integration/UpdateCrossReferences';
import { registerCrtDataSource } from '../../utils/crt/crtDataSource';
import type { CrtProcessData, CrtTableData } from '../../utils/crt/crtTypes';

const integration = { id: 'ipi-1', integrationPackName: 'Pack' } as never;

const PA = { id: 'pa', name: 'Alpha Process' };
const PB = { id: 'pb', name: 'Beta Process' };
const PC = { id: 'pc', name: 'Gamma Process' };

/** The id comes from the name, so a table of the same name in two processes is one shared table. */
const tbl = (name: string, p: CrtProcessData, extra: Partial<CrtTableData> = {}): CrtTableData => ({
  id: `id-${name.toLowerCase().replace(/\W+/g, '-')}`,
  name,
  processId: p.id,
  processName: p.name,
  matchType: 'exact',
  columns: ['code', 'value'],
  defaultRows: [
    ['a', '1'],
    ['b', '2'],
  ],
  overrideRows: null,
  ...extra,
});
const broken = (name: string, p: CrtProcessData) =>
  tbl(name, p, { columns: [], defaultRows: [], unavailableReason: 'The table definition could not be read' });

const renderScreen = async (tables: CrtTableData[], named?: CrtProcessData[]) => {
  registerCrtDataSource({
    listTables: async () => tables,
    ...(named ? { listProcesses: async () => named } : {}),
  });
  const utils = render(<UpdateCrossReferences componentKey="k" integration={integration} />);
  await waitFor(() => {
    expect(screen.queryByRole('grid') ?? screen.queryByText('No editable cross reference tables')).not.toBeNull();
  });
  return utils;
};

const user = () => userEvent.setup();
const processButton = () => screen.getAllByRole('button', { name: /^Process\b/ })[0];
const tableButton = () => screen.getAllByRole('button', { name: /^Table\b/ })[0];
const option = (name: string): HTMLElement =>
  screen.getAllByRole('option').find((o) => within(o).queryByText(name) !== null) as HTMLElement;
const gridName = () => screen.getByRole('grid').getAttribute('aria-label');
const hasDot = (el: HTMLElement) => within(el).queryByRole('img', { name: 'Unsaved changes' }) !== null;

async function pickProcess(u: ReturnType<typeof user>, name: string) {
  await u.click(processButton());
  await u.click(option(name));
}
async function pickTable(u: ReturnType<typeof user>, name: string) {
  await u.click(tableButton());
  await u.click(option(name));
}

beforeEach(() => {
  ctx.boomiConfig = {};
  ctx.renderComponent.mockReset();
  confirm.mockReset();
  confirm.mockResolvedValue(false);
});
afterEach(() => registerCrtDataSource(null));

describe('what opens first', () => {
  it('opens the first process, and its first table, and lists only that process in the Table dropdown', async () => {
    const u = user();
    await renderScreen([tbl('Gamma', PA), tbl('Alpha', PA), tbl('Delta', PB)], [PB, PA]);

    expect(gridName()).toBe('Alpha (Alpha Process)');
    expect(processButton().textContent).toContain('Alpha Process');
    await u.click(tableButton());
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Alpha'),
      expect.stringContaining('Gamma'),
    ]);
  });

  it('skips a first process that has no table', async () => {
    await renderScreen([tbl('Real', PB)], [PA, PB]);
    expect(gridName()).toBe('Real (Beta Process)');
    expect(processButton().textContent).toContain('Beta Process');
  });

  it('skips a first process whose tables cannot be edited', async () => {
    await renderScreen([broken('Nope', PA), tbl('Fine', PB)], [PA, PB]);
    expect(gridName()).toBe('Fine (Beta Process)');
  });

  it('works for a source that cannot list processes: they come from the tables', async () => {
    const u = user();
    await renderScreen([tbl('One', PA), tbl('Two', PB)]);
    await u.click(processButton());
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });
});

describe('the top of the screen', () => {
  it('starts with the two dropdowns: no title or description of its own under the page header', async () => {
    await renderScreen([tbl('Alpha', PA), tbl('Beta', PB)], [PA, PB]);
    expect(screen.queryByText('Cross Reference Tables')).toBeNull();
    expect(screen.queryByText(/View the lookup tables of this integration/)).toBeNull();
    const first = document.querySelector('.boomi-crt-screen')?.firstElementChild as HTMLElement;
    expect(first.className).toContain('boomi-crt-picker');
    expect(within(first).getAllByRole('button')).toHaveLength(2);
  });
});

describe('the Process dropdown', () => {
  it('shows one process, disabled', async () => {
    await renderScreen([tbl('Only', PA)], [PA]);
    const button = processButton() as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Alpha Process');
    expect((tableButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('lists a process with no table, disabled, with the reason, and cannot choose it', async () => {
    const u = user();
    await renderScreen([tbl('Alpha', PA)], [PA, PC]);

    await u.click(processButton());
    const empty = option('Gamma Process');
    expect(empty.getAttribute('aria-disabled')).toBe('true');
    expect(within(empty).getByText('No tables in this process')).toBeTruthy();
    expect(option('Alpha Process').getAttribute('aria-disabled')).toBeNull();

    await u.click(empty);
    expect(gridName()).toBe('Alpha (Alpha Process)');
  });

  it('describes a process by how many tables it has', async () => {
    const u = user();
    await renderScreen([tbl('One', PA), tbl('Two', PA), tbl('Three', PB)], [PA, PB]);
    await u.click(processButton());
    expect(within(option('Alpha Process')).getByText('2 tables')).toBeTruthy();
    expect(within(option('Beta Process')).getByText('1 table')).toBeTruthy();
  });

  it('has a search box that says what it searches when there are many processes', async () => {
    const u = user();
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `Process ${i}` }));
    await renderScreen(many.map((p) => tbl('Shared', p)), many);
    await u.click(processButton());
    expect(screen.getByRole('textbox', { name: 'Search processes' })).toBeTruthy();
  });
});

describe('switching process', () => {
  it('keeps the open table when the new process has it too', async () => {
    const u = user();
    // 'Aaa First' sorts before 'Shared' in the second process, so keeping the open table is not luck.
    await renderScreen([tbl('Only A', PA), tbl('Shared', PA), tbl('Aaa First', PB), tbl('Shared', PB)], [PA, PB]);
    await pickTable(u, 'Shared');
    expect(gridName()).toBe('Shared (Alpha Process)');

    await pickProcess(u, 'Beta Process');
    expect(gridName()).toBe('Shared (Beta Process)');
  });

  it('opens the first table of the new process when it does not have the open one', async () => {
    const u = user();
    await renderScreen([tbl('Only A', PA), tbl('Shared', PB), tbl('Zed', PB)], [PA, PB]);
    expect(gridName()).toBe('Only A (Alpha Process)');

    await pickProcess(u, 'Beta Process');
    expect(gridName()).toBe('Shared (Beta Process)');
  });

  it('does not carry over a table that cannot be edited in the new process', async () => {
    const u = user();
    await renderScreen([tbl('Shared', PA), broken('Shared', PB), tbl('Other', PB)], [PA, PB]);
    await pickProcess(u, 'Beta Process');
    expect(gridName()).toBe('Other (Beta Process)');
  });

  it('lists only the tables of the new process afterwards', async () => {
    const u = user();
    await renderScreen([tbl('A1', PA), tbl('B1', PB), tbl('B2', PB)], [PA, PB]);
    await pickProcess(u, 'Beta Process');
    await u.click(tableButton());
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('keeps each process own edits and marks the process that has some', async () => {
    const u = user();
    await renderScreen([tbl('Shared', PA), tbl('Shared', PB)], [PA, PB]);
    fireEvent.click(screen.getByRole('button', { name: /^Edit Shared \(Alpha Process\)/ }));

    await pickProcess(u, 'Beta Process');
    await u.click(processButton());
    expect(hasDot(option('Alpha Process'))).toBe(true);
    expect(hasDot(option('Beta Process'))).toBe(false);
    await u.keyboard('{Escape}');

    // Back in the first process the edit is still there: the screen asks before leaving.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0].description).toMatch(/One table has unsaved changes/);
  });
});

describe('a process with tables that cannot be edited', () => {
  it('can be chosen, shows the reasons and keeps the Process dropdown to go back', async () => {
    const u = user();
    await renderScreen([tbl('Fine', PA), broken('Nope', PB)], [PA, PB]);

    await u.click(processButton());
    expect(within(option('Beta Process')).getByText('No editable tables')).toBeTruthy();
    await u.click(option('Beta Process'));

    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByText('No editable cross reference tables')).toBeTruthy();
    expect(screen.getByText(/Nope \(Beta Process\)/)).toBeTruthy();

    await pickProcess(u, 'Alpha Process');
    expect(gridName()).toBe('Fine (Alpha Process)');
  });

  it('shows as a process with no tables when the config hides unavailable tables', async () => {
    const u = user();
    ctx.boomiConfig = { components: { k: { crossReferenceTables: { unavailableTables: 'hidden' } } } };
    await renderScreen([tbl('Fine', PA), broken('Nope', PB)], [PA, PB]);
    await u.click(processButton());
    const hidden = option('Beta Process');
    expect(hidden.getAttribute('aria-disabled')).toBe('true');
    expect(within(hidden).getByText('No tables in this process')).toBeTruthy();
  });
});

describe('empty packs', () => {
  it('a pack whose only process has no table shows that process, disabled, and the empty message', async () => {
    await renderScreen([], [PA]);
    expect(screen.getByText('No editable cross reference tables')).toBeTruthy();
    const button = processButton() as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Alpha Process');
  });

  it('a pack with no process at all shows the empty message and no Process dropdown', async () => {
    await renderScreen([], []);
    expect(screen.getByText('No editable cross reference tables')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Process\b/ })).toHaveLength(0);
  });
});

describe('full screen', () => {
  it('shows the Process and the Table dropdown in the caption', async () => {
    await renderScreen([tbl('Alpha', PA), tbl('Beta', PB)], [PA, PB]);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle full screen' }));
    const caption = document.querySelector('.boomi-crt-fs-caption') as HTMLElement;
    expect(within(caption).getByRole('button', { name: 'Process: Alpha Process' })).toBeTruthy();
    expect(within(caption).getByRole('button', { name: 'Table: Alpha' })).toBeTruthy();
  });

  it('switching process in full screen works the same', async () => {
    const u = user();
    await renderScreen([tbl('Alpha', PA), tbl('Beta', PB)], [PA, PB]);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle full screen' }));
    const caption = document.querySelector('.boomi-crt-fs-caption') as HTMLElement;
    await u.click(within(caption).getByRole('button', { name: 'Process: Alpha Process' }));
    await u.click(option('Beta Process'));
    expect(gridName()).toBe('Beta (Beta Process)');
  });
});
