/**
 * @file UpdateCrossReferencesSave.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Saving from the cross reference table screen: what the save bar says, one request per table and
 * process with the stamp that was loaded, a reset when a table that had rows of its own shows the
 * defaults again, a clean table after a save, the conflict prompt, the size check, the split button
 * and the confirmation for a table that several processes share (one process after the other, a
 * result per process, a retry for the failed ones), and a screen that cannot be used while a save
 * runs. The grid and the toolbar are small stand-ins, as in the other screen tests; the stand-in grid
 * has one button that edits the first cell of the open table.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ctx = vi.hoisted(() => ({
  boomiConfig: {} as Record<string, unknown>,
  renderComponent: vi.fn(),
}));
const fetchTables = vi.hoisted(() => vi.fn());
const saveTable = vi.hoisted(() => vi.fn());
const resetTable = vi.hoisted(() => vi.fn());
const fetchHistory = vi.hoisted(() => vi.fn());
const emit = vi.hoisted(() => vi.fn());
const toasts = vi.hoisted(() => ({ shown: [] as string[] }));

vi.mock('../../context/pluginContext', () => ({ usePlugin: () => ctx }));
vi.mock('../../hooks/useDialogs', () => ({ useDialogs: () => ({ confirm: vi.fn(async () => true), alert: vi.fn() }) }));
vi.mock('../../events.service', () => ({ emitEmbedKitEvent: emit }));
vi.mock('../../service/crossReferenceTables.service', () => ({
  useCrossReferenceTablesService: () => ({
    fetchCrossReferenceTables: fetchTables,
    saveCrossReferenceTable: saveTable,
    resetCrossReferenceTable: resetTable,
    fetchCrossReferenceHistory: fetchHistory,
  }),
}));
vi.mock('../../components/core/Page', () => ({
  default: ({ bodyContent, callbackOne }: { bodyContent: React.ReactNode; callbackOne?: () => void }) => (
    <div>
      <button type="button" disabled={!callbackOne} onClick={callbackOne}>
        My Integrations
      </button>
      {bodyContent}
    </div>
  ),
}));
vi.mock('../../components/ui/Dialog', () => ({
  default: ({ error }: { error?: { header: string; message: string } }) =>
    error ? (
      <div role="alert">
        <h2>{error.header}</h2>
        <p>{error.message}</p>
      </div>
    ) : null,
}));
vi.mock('../../components/ui/ToastNotification', () => ({
  default: ({ content }: { content: string }) => {
    toasts.shown.push(content);
    return <div role="status">{content}</div>;
  },
}));
vi.mock('../../components/integration/crt/CrtToolbar', () => ({
  default: ({ trailing }: { trailing?: React.ReactNode }) => <div>{trailing}</div>,
}));
vi.mock('../../components/integration/crt/CrtGrid', () => ({
  default: forwardRef<
    unknown,
    { ariaLabel: string; store: { setCell: (r: number, c: number, v: string) => boolean; getCell: (r: number, c: number) => string } }
  >(
    ({ ariaLabel, store }, ref) => {
      useImperativeHandle(ref, () => ({ run: () => {}, activeCell: () => ({ row: 0, col: 0 }), showCell: () => {}, focus: () => {} }), []);
      return (
        <div role="grid" tabIndex={0} aria-label={ariaLabel}>
          <button type="button" onClick={() => store.setCell(0, 0, store.getCell(0, 0) === 'EDITED' ? 'EDITED AGAIN' : 'EDITED')}>
            edit first cell
          </button>
        </div>
      );
    }
  ),
}));

import UpdateCrossReferences from '../../components/integration/UpdateCrossReferences';
import { registerCrtDataSource } from '../../utils/crt/crtDataSource';
import { HttpError } from '../../service/http';

const integration = { id: 'ipi-1', environmentId: 'env-1', integrationPackId: 'pack-1', integrationPackName: 'Pack' } as never;

const serverTable = (name: string, over: Record<string, unknown> = {}) => ({
  id: `id-${name.toLowerCase()}`,
  name,
  processId: 'p1',
  processName: 'Pack - Main',
  overridden: false,
  matchType: 'exact',
  columns: ['code', 'value'],
  defaultRows: [['a', '1'], ['b', '2']],
  overrideRows: null,
  stamp: 'd0.start',
  ...over,
});
/** The same table in a second process. */
const second = (name: string, over: Record<string, unknown> = {}) =>
  serverTable(name, { processId: 'p2', processName: 'Pack - Second', stamp: 'd0.second', ...over });

const renderScreen = () => render(<UpdateCrossReferences componentKey="k" integration={integration} onBack={vi.fn()} />);
const saveButton = (name: RegExp | string = 'Save') => screen.getByRole('button', { name }) as HTMLButtonElement;
const edit = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'edit first cell' }));
const problem = (status: number, code?: string, extra: Record<string, unknown> = {}) =>
  new HttpError('failed', status, code ? { code, error: 'failed', ...extra } : undefined);

beforeEach(() => {
  ctx.boomiConfig = {};
  for (const m of [fetchTables, saveTable, resetTable, fetchHistory, emit]) m.mockReset();
  fetchHistory.mockResolvedValue({ environment: null, tables: [] });
  toasts.shown.length = 0;
});
afterEach(() => {
  registerCrtDataSource(null);
});

describe('the save bar', () => {
  it('says what Save will do and enables it only when something differs', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha')] });
    renderScreen();
    await screen.findByRole('grid');
    expect(screen.getByText('No changes to save')).toBeTruthy();
    expect(saveButton().disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Override' }));
    expect(screen.getByText('Save will create your own copy (2 rows)')).toBeTruthy();
    expect(saveButton().disabled).toBe(false);

    await edit(user);
    expect(screen.getByText('Save will create your own copy (2 rows), 1 row changed')).toBeTruthy();
  });

  it('counts the rows changed in a table that already has rows of its own', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({
      tables: [serverTable('Alpha', { overridden: true, overrideRows: [['x', '1'], ['y', '2']], stamp: 'o2.mine' })],
    });
    renderScreen();
    await screen.findByRole('grid');
    expect(screen.getByText('No changes to save')).toBeTruthy();
    await edit(user);
    expect(screen.getByText('1 row changed')).toBeTruthy();
  });
});

describe('saving the open table', () => {
  it('sends the whole table with the stamp that was loaded, then shows a clean table', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha', { overridden: true, overrideRows: [['x', '1'], ['y', '2']], stamp: 'o2.mine' })] });
    saveTable.mockResolvedValue({ processId: 'p1', tableId: 'id-alpha', overridden: true, rowCount: 2, stamp: 'o2.saved' });
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());

    await waitFor(() => expect(saveTable).toHaveBeenCalledTimes(1));
    expect(saveTable.mock.calls[0][0]).toEqual({
      integrationPackInstanceId: 'ipi-1',
      environmentId: 'env-1',
      processId: 'p1',
      tableId: 'id-alpha',
      rows: [['EDITED', '1'], ['y', '2']],
      expectedStamp: 'o2.mine',
    });
    expect(resetTable).not.toHaveBeenCalled();
    await screen.findByText('Table saved.');
    // The store was rebuilt from what was saved: nothing differs now.
    expect(screen.getByText('No changes to save')).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it('uses the stamp from the last save for the next one', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha', { overridden: true, overrideRows: [['x', '1']], stamp: 'o1.mine' })] });
    saveTable.mockResolvedValue({ processId: 'p1', tableId: 'id-alpha', overridden: true, rowCount: 1, stamp: 'o1.next' });
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Table saved.');
    await edit(user);
    await user.click(saveButton());
    await waitFor(() => expect(saveTable).toHaveBeenCalledTimes(2));
    expect(saveTable.mock.calls[1][0].expectedStamp).toBe('o1.next');
  });

  it('reports ids and counts in an event, never the cell values', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha', { overridden: true, overrideRows: [['x', '1']], stamp: 'o1.mine' })] });
    saveTable.mockResolvedValue({ processId: 'p1', tableId: 'id-alpha', overridden: true, rowCount: 1, stamp: 'o1.next' });
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Table saved.');
    expect(emit).toHaveBeenCalledTimes(1);
    const [type, source, data] = emit.mock.calls[0];
    expect(type).toBe('crossReference.table.saved');
    expect(source).toMatchObject({ integrationPackInstanceId: 'ipi-1', integrationPackId: 'pack-1', environmentId: 'env-1', componentKey: 'k' });
    expect(data).toEqual({ integrationPackInstanceId: 'ipi-1', environmentId: 'env-1', processId: 'p1', tableId: 'id-alpha', rowCount: 1, changedRowCount: 1 });
    expect(JSON.stringify(emit.mock.calls)).not.toContain('EDITED');
  });

  it('restores the defaults, with a reset, when a table that had rows of its own shows the defaults again', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha', { overridden: true, overrideRows: [['x', '1']], stamp: 'o1.mine' })] });
    resetTable.mockResolvedValue({ processId: 'p1', tableId: 'id-alpha', overridden: false, rowCount: 0, stamp: 'd0.reset' });
    renderScreen();
    await screen.findByRole('grid');
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(screen.getByText('Save will restore the default values')).toBeTruthy();
    await user.click(saveButton('Restore defaults'));
    await waitFor(() => expect(resetTable).toHaveBeenCalledTimes(1));
    expect(saveTable).not.toHaveBeenCalled();
    expect(resetTable.mock.calls[0][0]).toMatchObject({ processId: 'p1', tableId: 'id-alpha', expectedStamp: 'o1.mine' });
    expect(resetTable.mock.calls[0][0].rows).toBeUndefined();
    await screen.findByText('Default values restored.');
    expect(emit.mock.calls[0][0]).toBe('crossReference.table.reset');
    expect(screen.getByRole('button', { name: 'Override' })).toBeTruthy();
  });

  it('keeps the edits and says why when a save fails', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha', { overridden: true, overrideRows: [['x', '1']], stamp: 'o1.mine' })] });
    saveTable.mockRejectedValue(problem(502, 'BOOMI_REJECTED'));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/did not accept the save/)).toBeTruthy();
    expect(screen.getByText('1 row changed')).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
    expect(emit).not.toHaveBeenCalled();
  });

  it('refuses a table that is over the size the server accepts, and sends nothing', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({
      tables: [serverTable('Alpha', { overridden: true, overrideRows: [['x', '1']], stamp: 'o1.mine' })],
      limits: { maxSaveBytes: 10 },
    });
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());
    await screen.findByText(/over the .* limit for saving/);
    expect(saveTable).not.toHaveBeenCalled();
  });

  it('cannot be used while a save runs, and the breadcrumb is dead', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha', { overridden: true, overrideRows: [['x', '1']], stamp: 'o1.mine' })] });
    let finish!: (v: unknown) => void;
    saveTable.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Saving...');
    // The wait is a small window of its own, not text floating over the table.
    expect(screen.getByRole('alertdialog').getAttribute('aria-busy')).toBe('true');
    expect(document.querySelector('.boomi-crt-busy-card')?.textContent).toMatch(/Saving\.\.\./);
    expect(document.querySelector('.boomi-crt-screen')?.hasAttribute('inert')).toBe(true);
    expect((screen.getByRole('button', { name: 'My Integrations' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish({ processId: 'p1', tableId: 'id-alpha', overridden: true, rowCount: 1, stamp: 'o1.next' }));
    await screen.findByText('Table saved.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.querySelector('.boomi-crt-screen')?.hasAttribute('inert')).toBe(false);
    expect((screen.getByRole('button', { name: 'My Integrations' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends one save at a time: a second click while one runs is ignored', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha', { overridden: true, overrideRows: [['x', '1']], stamp: 'o1.mine' })] });
    let finish!: (v: unknown) => void;
    saveTable.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Saving...');
    await user.click(saveButton()).catch(() => undefined);
    expect(saveTable).toHaveBeenCalledTimes(1);
    await act(async () => finish({ processId: 'p1', tableId: 'id-alpha', overridden: true, rowCount: 1, stamp: 'o1.next' }));
  });
});

describe('a table that someone else changed', () => {
  const setup = async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha', { overridden: true, overrideRows: [['x', '1']], stamp: 'o1.mine' })] });
    saveTable.mockRejectedValueOnce(problem(409, 'TABLE_CHANGED', { currentStamp: 'o1.theirs' }));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('This table was changed');
    return user;
  };

  it('offers to overwrite, and the overwrite sends the stamp of what is there now', async () => {
    const user = await setup();
    saveTable.mockResolvedValue({ processId: 'p1', tableId: 'id-alpha', overridden: true, rowCount: 1, stamp: 'o1.after' });
    await user.click(screen.getByRole('button', { name: 'Overwrite' }));
    await waitFor(() => expect(saveTable).toHaveBeenCalledTimes(2));
    expect(saveTable.mock.calls[1][0].expectedStamp).toBe('o1.theirs');
    expect(saveTable.mock.calls[1][0].rows).toEqual([['EDITED', '1']]);
    await screen.findByText('Table saved.');
  });

  it('can reload the other version, which discards the edits', async () => {
    const user = await setup();
    fetchTables.mockResolvedValue({
      tables: [serverTable('Alpha', { overridden: true, overrideRows: [['theirs', '9']], stamp: 'o1.theirs' })],
    });
    await user.click(screen.getByRole('button', { name: 'Reload table' }));
    await waitFor(() => expect(fetchTables).toHaveBeenCalledTimes(2));
    expect(fetchTables.mock.calls[1][0]).toMatchObject({ processId: 'p1', tableId: 'id-alpha' });
    await waitFor(() => expect(screen.getByText('No changes to save')).toBeTruthy());
    expect(saveTable).toHaveBeenCalledTimes(1);
  });

  it('can keep editing: nothing changes', async () => {
    const user = await setup();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('This table was changed')).toBeNull();
    expect(screen.getByText('1 row changed')).toBeTruthy();
    expect(saveTable).toHaveBeenCalledTimes(1);
  });
});

describe('a table that several processes share', () => {
  const shared = (over: Record<string, unknown> = {}) => ({
    tables: [
      serverTable('Alpha', { overridden: true, overrideRows: [['x', '1']], stamp: 'o1.mine' }),
      second('Alpha', over),
    ],
  });
  const ok = (processId: string, stamp: string) => ({ processId, tableId: 'id-alpha', overridden: true, rowCount: 1, stamp });

  it('gives a plain Save to a table that is not shared and a split button to one that is', async () => {
    fetchTables.mockResolvedValue({ tables: [serverTable('Solo')] });
    const { unmount } = renderScreen();
    await screen.findByRole('grid');
    expect(screen.queryByRole('button', { name: 'More ways to save' })).toBeNull();
    unmount();

    fetchTables.mockResolvedValue(shared());
    renderScreen();
    await screen.findByRole('grid');
    expect(screen.getByRole('button', { name: 'Save to this process' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'More ways to save' })).toBeTruthy();
  });

  it('"Save to this process" writes only this process', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(shared());
    saveTable.mockResolvedValue(ok('p1', 'o1.next'));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(screen.getByRole('button', { name: 'Save to this process' }));
    await screen.findByText('Table saved.');
    expect(saveTable).toHaveBeenCalledTimes(1);
    expect(saveTable.mock.calls[0][0].processId).toBe('p1');
  });

  it('lists the other process with what will happen there, all ticked, and saves one after the other', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(shared());
    const order: string[] = [];
    let running = 0;
    saveTable.mockImplementation(async (args: { processId: string }) => {
      running += 1;
      expect(running).toBe(1); // never two at once
      order.push(`start ${args.processId}`);
      await Promise.resolve();
      order.push(`end ${args.processId}`);
      running -= 1;
      return ok(args.processId, `o1.${args.processId}`);
    });
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(screen.getByRole('button', { name: 'More ways to save' }));
    await user.click(screen.getByRole('menuitem', { name: /Save to other processes that share this table/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Second')).toBeTruthy();
    expect(within(dialog).getByText('Uses the publisher defaults and will get its own copy.')).toBeTruthy();
    const box = within(dialog).getByRole('checkbox') as HTMLInputElement;
    expect(box.checked).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: 'Save to 2 processes' }));

    await within(dialog).findByRole('button', { name: 'Close' });
    expect(order).toEqual(['start p1', 'end p1', 'start p2', 'end p2']);
    expect(saveTable.mock.calls.map((c) => c[0].processId)).toEqual(['p1', 'p2']);
    // Both get the open table's rows, each with the stamp it was loaded with.
    expect(saveTable.mock.calls[1][0]).toMatchObject({ rows: [['EDITED', '1']], expectedStamp: 'd0.second' });
    expect(within(dialog).getAllByText('Saved')).toHaveLength(2);
    expect(emit.mock.calls.filter((c) => c[0] === 'crossReference.table.saved')).toHaveLength(2);
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('writes only the processes that stay ticked', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(shared());
    saveTable.mockImplementation(async (args: { processId: string }) => ok(args.processId, 'o1.x'));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(screen.getByRole('button', { name: 'More ways to save' }));
    await user.click(screen.getByRole('menuitem'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Save to 1 process' }));
    await within(dialog).findByRole('button', { name: 'Close' });
    expect(saveTable.mock.calls.map((c) => c[0].processId)).toEqual(['p1']);
  });

  it('shows a failure per process, rolls nothing back, and retries only the failed one', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(shared());
    saveTable.mockImplementation(async (args: { processId: string }) => {
      if (args.processId === 'p2') throw problem(503, 'THROTTLED');
      return ok(args.processId, 'o1.p1');
    });
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(screen.getByRole('button', { name: 'More ways to save' }));
    await user.click(screen.getByRole('menuitem'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save to 2 processes' }));
    await within(dialog).findByRole('button', { name: 'Retry 1 failed process' });
    expect(within(dialog).getAllByText(/Saved/)).toHaveLength(1);
    expect(within(dialog).getByText(/Failed: Boomi is busy right now/)).toBeTruthy();
    expect(saveTable).toHaveBeenCalledTimes(2);

    saveTable.mockImplementation(async (args: { processId: string }) => ok(args.processId, 'o1.p2'));
    await user.click(within(dialog).getByRole('button', { name: 'Retry 1 failed process' }));
    await waitFor(() => expect(saveTable).toHaveBeenCalledTimes(3));
    expect(saveTable.mock.calls[2][0].processId).toBe('p2');
    await within(dialog).findByRole('button', { name: 'Close' });
    expect(within(dialog).queryByRole('button', { name: /Retry/ })).toBeNull();
  });

  it('a process that already holds these rows is listed but not selectable', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(shared({ overridden: true, overrideRows: [['EDITED', '1']], stamp: 'o1.same' }));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(screen.getByRole('button', { name: 'More ways to save' }));
    await user.click(screen.getByRole('menuitem'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Already has these rows.')).toBeTruthy();
    const box = within(dialog).getByRole('checkbox') as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
    expect(within(dialog).getByRole('button', { name: 'Save to 1 process' })).toBeTruthy();
  });

  it('a reset uses the same confirmation with its own wording', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({
      tables: [
        serverTable('Alpha', { overridden: true, overrideRows: [['x', '1']], stamp: 'o1.mine' }),
        second('Alpha', { overridden: true, overrideRows: [['y', '2']], stamp: 'o1.second' }),
      ],
    });
    resetTable.mockImplementation(async (args: { processId: string }) => ({ processId: args.processId, tableId: 'id-alpha', overridden: false, rowCount: 0, stamp: 'd0.r' }));
    renderScreen();
    await screen.findByRole('grid');
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await screen.findByText('Save will restore the default values');
    // After a reset the screen hands focus back to the grid on the next animation frame.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    await user.click(screen.getByRole('button', { name: 'More ways to save' }));
    await user.click(screen.getByRole('menuitem', { name: /Restore defaults in other processes/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Has its own rows, which will go back to the defaults.')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Restore defaults in 2 processes' }));
    await within(dialog).findByRole('button', { name: 'Close' });
    expect(resetTable.mock.calls.map((c) => c[0].processId)).toEqual(['p1', 'p2']);
    expect(saveTable).not.toHaveBeenCalled();
  });

  it('the other process shows what was written when it is opened afterwards', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(shared());
    saveTable.mockImplementation(async (args: { processId: string }) => ok(args.processId, 'o1.x'));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(screen.getByRole('button', { name: 'More ways to save' }));
    await user.click(screen.getByRole('menuitem'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save to 2 processes' }));
    await within(dialog).findByRole('button', { name: 'Close' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    await user.click(screen.getAllByRole('button', { name: /^Process\b/ })[0]);
    await user.click(screen.getAllByRole('option').find((o) => within(o).queryByText('Second') !== null) as HTMLElement);
    expect(screen.getByText('Overridden')).toBeTruthy();
    expect(screen.getByText('No changes to save')).toBeTruthy();
  });
});
