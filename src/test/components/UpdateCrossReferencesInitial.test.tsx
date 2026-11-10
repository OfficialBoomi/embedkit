/**
 * @file UpdateCrossReferencesInitial.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Asking the cross reference table screen for a table (`initialTableId`, `initialProcessId`): the table opens
 * selected, in the requested process, in another process when the requested one does not have it, with only a
 * process, with neither (today's choice), and with a table that cannot be opened (today's choice and a short
 * notice, no dialog). Changing the request after the screen is ready selects the new table and keeps the edits
 * of the other tables, and asking again for a table the user has since left is a new request. The grid and the
 * toolbar are small stand-ins, as in the other screen tests; the stand-in grid has one button that edits the
 * first cell of the open table, and both pickers are the real ones.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ctx = vi.hoisted(() => ({
  boomiConfig: {} as Record<string, unknown>,
  renderComponent: vi.fn(),
}));
const confirm = vi.hoisted(() => vi.fn());
/** The label of every grid the stand-in drew, in order, to see whether a table was ever shown. */
const drawn = vi.hoisted(() => ({ labels: [] as string[] }));

vi.mock('../../context/pluginContext', () => ({ usePlugin: () => ctx }));
vi.mock('../../hooks/useDialogs', () => ({ useDialogs: () => ({ confirm, alert: vi.fn() }) }));
vi.mock('../../components/core/Page', () => ({
  default: ({ bodyContent }: { bodyContent: React.ReactNode }) => <div>{bodyContent}</div>,
}));
vi.mock('../../components/ui/Dialog', () => ({
  default: ({ error }: { error?: { header: string } }) => (error ? <div role="alertdialog">{error.header}</div> : null),
}));
vi.mock('../../components/integration/crt/CrtToolbar', () => ({
  default: ({ trailing }: { trailing?: React.ReactNode }) => <div>{trailing}</div>,
}));
vi.mock('../../components/integration/crt/CrtGrid', () => ({
  default: forwardRef<
    unknown,
    { ariaLabel: string; store: { setCell: (r: number, c: number, v: string) => boolean; getCell: (r: number, c: number) => string } }
  >(({ ariaLabel, store }, ref) => {
    useImperativeHandle(ref, () => ({ run: () => {}, activeCell: () => ({ row: 0, col: 0 }), showCell: () => {}, focus: () => {} }), []);
    drawn.labels.push(ariaLabel);
    return (
      <div role="grid" tabIndex={0} aria-label={ariaLabel}>
        <button type="button" onClick={() => store.setCell(0, 0, 'EDITED')}>
          edit first cell
        </button>
      </div>
    );
  }),
}));

import UpdateCrossReferences from '../../components/integration/UpdateCrossReferences';
import { registerCrtDataSource } from '../../utils/crt/crtDataSource';
import type { CrtProcessData, CrtTableData } from '../../utils/crt/crtTypes';

const integration = { id: 'ipi-1', integrationPackName: 'Pack' } as never;

const PA = { id: 'pa', name: 'Alpha Process' };
const PB = { id: 'pb', name: 'Beta Process' };
const PC = { id: 'pc', name: 'Gamma Process' };
const PROCESSES = [PA, PB, PC];

/** Tables that already have rows of their own, so one cell edit is the only change. */
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
  overrideRows: [
    ['x', '1'],
    ['y', '2'],
  ],
  ...extra,
});
const broken = (name: string, p: CrtProcessData) =>
  tbl(name, p, { columns: [], defaultRows: [], overrideRows: null, unavailableReason: 'The table definition could not be read' });

// Alpha1 is first by name in the first process: today's choice. Shared is in two processes.
const TABLES = [
  tbl('Alpha1', PA),
  tbl('Shared', PA),
  tbl('Beta1', PB),
  tbl('Shared', PB),
  tbl('Gamma1', PC),
  tbl('Gamma2', PC),
];
const ID = (name: string) => `id-${name.toLowerCase()}`;
const NOT_MET = 'That table cannot be opened here, so the first table is shown.';

type Props = { initialTableId?: string; initialProcessId?: string; active?: boolean; wizard?: boolean };
const element = (props: Props = {}) => <UpdateCrossReferences componentKey="k" integration={integration} {...props} />;

const listTables = vi.fn();
const register = (tables: CrtTableData[] = TABLES) => {
  listTables.mockReset();
  listTables.mockImplementation(async () => tables);
  registerCrtDataSource({ listTables, listProcesses: async () => PROCESSES });
};

const renderScreen = async (props: Props = {}, tables?: CrtTableData[]) => {
  register(tables);
  const utils = render(element(props));
  await screen.findByRole('grid');
  return utils;
};

const gridName = () => screen.getByRole('grid').getAttribute('aria-label');
const processButton = () => screen.getAllByRole('button', { name: /^Process\b/ })[0];
const tableButton = () => screen.getAllByRole('button', { name: /^Table\b/ })[0];
const option = (name: string): HTMLElement =>
  screen.getAllByRole('option').find((o) => within(o).queryByText(name) !== null) as HTMLElement;
const notice = () => screen.queryByText(NOT_MET);

beforeEach(() => {
  drawn.labels.length = 0;
  ctx.boomiConfig = {};
  ctx.renderComponent.mockReset();
  confirm.mockReset();
  confirm.mockResolvedValue(false);
});
afterEach(() => registerCrtDataSource(null));

describe('what opens first when a table is asked for', () => {
  it('with nothing asked for, opens the first table of the first process, with no notice', async () => {
    await renderScreen();
    expect(gridName()).toBe('Alpha1 (Alpha Process)');
    expect(notice()).toBeNull();
  });

  it('with empty ids it is the same as nothing asked for', async () => {
    await renderScreen({ initialTableId: '', initialProcessId: '' });
    expect(gridName()).toBe('Alpha1 (Alpha Process)');
    expect(notice()).toBeNull();
  });

  it('opens the table asked for, and the Process dropdown follows it', async () => {
    await renderScreen({ initialTableId: ID('Gamma2') });
    expect(gridName()).toBe('Gamma2 (Gamma Process)');
    expect(processButton().textContent).toContain('Gamma Process');
    expect(tableButton().textContent).toContain('Gamma2');
    expect(notice()).toBeNull();
  });

  it('goes straight to the table asked for, without showing the usual first table for a moment', async () => {
    await renderScreen({ initialTableId: ID('Gamma2'), initialProcessId: 'pc' });
    expect(gridName()).toBe('Gamma2 (Gamma Process)');
    expect(new Set(drawn.labels)).toEqual(new Set(['Gamma2 (Gamma Process)']));
  });

  it('opens it in the requested process when that process has the table', async () => {
    await renderScreen({ initialTableId: ID('Shared'), initialProcessId: 'pb' });
    expect(gridName()).toBe('Shared (Beta Process)');
    expect(processButton().textContent).toContain('Beta Process');
  });

  it('opens it in the first process that has it when no process is named', async () => {
    await renderScreen({ initialTableId: ID('Shared') });
    expect(gridName()).toBe('Shared (Alpha Process)');
  });

  it('opens it in another process when the requested one does not have it', async () => {
    await renderScreen({ initialTableId: ID('Beta1'), initialProcessId: 'pa' });
    expect(gridName()).toBe('Beta1 (Beta Process)');
    expect(processButton().textContent).toContain('Beta Process');
    expect(notice()).toBeNull();
  });

  it('opens the first table of the requested process when only a process is asked for', async () => {
    await renderScreen({ initialProcessId: 'pc' });
    expect(gridName()).toBe('Gamma1 (Gamma Process)');
    expect(processButton().textContent).toContain('Gamma Process');
  });

  it('keeps the Table dropdown to the tables of the open process', async () => {
    const user = userEvent.setup();
    await renderScreen({ initialTableId: ID('Beta1') });
    await user.click(tableButton());
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Beta1'),
      expect.stringContaining('Shared'),
    ]);
  });
});

describe('a table that cannot be opened', () => {
  it('falls back to the usual first table with a short notice and no dialog, for an unknown table', async () => {
    await renderScreen({ initialTableId: 'id-unknown', initialProcessId: 'pb' });
    expect(gridName()).toBe('Alpha1 (Alpha Process)');
    expect(notice()).not.toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('falls back the same way for a table that cannot be edited', async () => {
    await renderScreen({ initialTableId: ID('Dead') }, [...TABLES, broken('Dead', PB)]);
    expect(gridName()).toBe('Alpha1 (Alpha Process)');
    expect(notice()).not.toBeNull();
  });

  it('falls back the same way for a process that has no editable table', async () => {
    await renderScreen({ initialProcessId: 'pb' }, [tbl('Alpha1', PA), broken('Beta1', PB)]);
    expect(gridName()).toBe('Alpha1 (Alpha Process)');
    expect(notice()).not.toBeNull();
  });

  it('takes the notice away after a moment', async () => {
    await renderScreen({ initialTableId: 'id-unknown' });
    expect(notice()).not.toBeNull();
    await waitFor(() => expect(notice()).toBeNull(), { timeout: 5000 });
  });
});

describe('a request that changes after the screen is ready', () => {
  it('selects the new table, also in another process', async () => {
    const { rerender } = await renderScreen({ initialTableId: ID('Alpha1') });
    expect(gridName()).toBe('Alpha1 (Alpha Process)');

    rerender(element({ initialTableId: ID('Beta1'), initialProcessId: 'pb' }));
    await waitFor(() => expect(gridName()).toBe('Beta1 (Beta Process)'));
    expect(processButton().textContent).toContain('Beta Process');

    rerender(element({ initialTableId: ID('Gamma2') }));
    await waitFor(() => expect(gridName()).toBe('Gamma2 (Gamma Process)'));
    // Everything came from the one load.
    expect(listTables).toHaveBeenCalledTimes(1);
  });

  it('selects a process when only a process is asked for', async () => {
    const { rerender } = await renderScreen();
    rerender(element({ initialProcessId: 'pb' }));
    await waitFor(() => expect(gridName()).toBe('Beta1 (Beta Process)'));
  });

  it('keeps the edits of the other tables', async () => {
    const user = userEvent.setup();
    const { rerender } = await renderScreen({ initialTableId: ID('Alpha1') });
    await user.click(screen.getByRole('button', { name: 'edit first cell' }));
    expect(screen.getByText('1 row changed')).toBeTruthy();

    rerender(element({ initialTableId: ID('Beta1'), initialProcessId: 'pb' }));
    await waitFor(() => expect(gridName()).toBe('Beta1 (Beta Process)'));
    expect(screen.getByText('No changes to save')).toBeTruthy();
    // The other table keeps its dot while it is not the open one.
    await user.click(processButton());
    expect(within(option('Alpha Process')).queryByRole('img', { name: 'Unsaved changes' })).not.toBeNull();
    await user.keyboard('{Escape}');

    rerender(element({ initialTableId: ID('Alpha1'), initialProcessId: 'pa' }));
    await waitFor(() => expect(gridName()).toBe('Alpha1 (Alpha Process)'));
    expect(screen.getByText('1 row changed')).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('does not apply the same request twice, so a table the user picked since stays open', async () => {
    const user = userEvent.setup();
    const request = { initialTableId: ID('Alpha1'), initialProcessId: 'pa' };
    const { rerender } = await renderScreen(request);
    await user.click(tableButton());
    await user.click(option('Shared'));
    expect(gridName()).toBe('Shared (Alpha Process)');

    // Same values again (a re-render of the host): nothing moves.
    rerender(element({ ...request }));
    await waitFor(() => expect(gridName()).toBe('Shared (Alpha Process)'));
  });

  it('treats the same request, asked again after it went away, as a new request', async () => {
    const user = userEvent.setup();
    const request = { initialTableId: ID('Alpha1'), initialProcessId: 'pa' };
    const { rerender } = await renderScreen(request);
    await user.click(tableButton());
    await user.click(option('Shared'));
    expect(gridName()).toBe('Shared (Alpha Process)');

    rerender(element({}));
    await waitFor(() => expect(gridName()).toBe('Shared (Alpha Process)'));
    rerender(element(request));
    await waitFor(() => expect(gridName()).toBe('Alpha1 (Alpha Process)'));
  });

  it('leaves the open table alone, with the notice, when the new request cannot be met', async () => {
    const { rerender } = await renderScreen({ initialTableId: ID('Beta1') });
    rerender(element({ initialTableId: 'id-unknown' }));
    await waitFor(() => expect(notice()).not.toBeNull());
    expect(gridName()).toBe('Beta1 (Beta Process)');
  });
});

describe('in the wizard, where the screen is mounted before it is shown', () => {
  it('asks for nothing while hidden, then opens the requested table in the load it makes when first shown', async () => {
    register();
    const { rerender } = render(element({ wizard: true, active: false }));
    await new Promise((r) => setTimeout(r, 20));
    expect(listTables).not.toHaveBeenCalled();
    expect(screen.queryByRole('grid')).toBeNull();

    rerender(element({ wizard: true, active: true, initialTableId: ID('Gamma2'), initialProcessId: 'pc' }));
    await screen.findByRole('grid');
    expect(gridName()).toBe('Gamma2 (Gamma Process)');
    expect(listTables).toHaveBeenCalledTimes(1);
  });

  it('selects the requested table when the step is shown again, with the edits of the others kept and no new load', async () => {
    const user = userEvent.setup();
    register();
    const { rerender } = render(element({ wizard: true, active: true }));
    await screen.findByRole('grid');
    expect(gridName()).toBe('Alpha1 (Alpha Process)');
    await user.click(screen.getByRole('button', { name: 'edit first cell' }));

    // The step is left (nothing is asked for), then shown again with a request.
    rerender(element({ wizard: true, active: false }));
    expect(screen.queryByRole('grid')).toBeNull();
    rerender(element({ wizard: true, active: true, initialTableId: ID('Gamma1'), initialProcessId: 'pc' }));
    await waitFor(() => expect(gridName()).toBe('Gamma1 (Gamma Process)'));

    rerender(element({ wizard: true, active: true }));
    rerender(element({ wizard: true, active: true, initialTableId: ID('Alpha1'), initialProcessId: 'pa' }));
    await waitFor(() => expect(gridName()).toBe('Alpha1 (Alpha Process)'));
    expect(screen.getByText('1 row changed')).toBeTruthy();
    expect(listTables).toHaveBeenCalledTimes(1);
  });
});
