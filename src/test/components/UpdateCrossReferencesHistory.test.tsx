/**
 * @file UpdateCrossReferencesHistory.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The two history lines of the cross reference table screen: the last save of the open table made
 * through the screen, and the last save Boomi recorded for the whole environment. Covered here: the
 * lines appear after the tables, with the right wording and tooltip; they reload after a save or a
 * reset; a server without the route, a failure or a strange answer shows nothing and no error; the
 * `showHistory` setting turns them off and then no request is made; a request is cancelled when the
 * screen goes away; and the word "API" is never shown. The grid and the toolbar are small stand-ins,
 * as in the other screen tests; the stand-in grid has one button that edits the first cell.
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

vi.mock('../../context/pluginContext', () => ({ usePlugin: () => ctx }));
vi.mock('../../hooks/useDialogs', () => ({ useDialogs: () => ({ confirm: vi.fn(async () => true), alert: vi.fn() }) }));
vi.mock('../../events.service', () => ({ emitEmbedKitEvent: vi.fn() }));
vi.mock('../../service/crossReferenceTables.service', () => ({
  useCrossReferenceTablesService: () => ({
    fetchCrossReferenceTables: fetchTables,
    saveCrossReferenceTable: saveTable,
    resetCrossReferenceTable: resetTable,
    fetchCrossReferenceHistory: fetchHistory,
  }),
}));
vi.mock('../../components/core/Page', () => ({
  default: ({ bodyContent }: { bodyContent: React.ReactNode }) => <div>{bodyContent}</div>,
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
  default: ({ content }: { content: string }) => <div role="status">{content}</div>,
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
    return (
      <div role="grid" tabIndex={0} aria-label={ariaLabel}>
        <button type="button" onClick={() => store.setCell(0, 0, store.getCell(0, 0) === 'EDITED' ? 'EDITED AGAIN' : 'EDITED')}>
          edit first cell
        </button>
      </div>
    );
  }),
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
  overridden: true,
  matchType: 'exact',
  columns: ['code', 'value'],
  defaultRows: [['a', '1'], ['b', '2']],
  overrideRows: [['x', '1'], ['y', '2']],
  stamp: 'o2.mine',
  ...over,
});

const SAVED_AT = '2026-11-09T22:40:00Z';
const ENV_AT = '2026-11-09T22:40:02Z'; // Boomi's entry for the same save, a moment later
const shown = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

const tableRecord = (over: Record<string, unknown> = {}) => ({
  processId: 'p1',
  tableId: 'id-alpha',
  at: SAVED_AT,
  by: '',
  action: 'save',
  rowCount: 6,
  ...over,
});
const answer = (over: Record<string, unknown> = {}) => ({
  environment: { at: ENV_AT, by: 'svc@example.com', viaUi: false },
  tables: [tableRecord()],
  ...over,
});

// Our record gives the time, Boomi's entry for the same save gives the user: one line.
const LINE = `Last saved by svc@example.com on ${shown(SAVED_AT)}`;
const HINT = 'Boomi records this for the whole environment, not for one table.';

const renderScreen = () => render(<UpdateCrossReferences componentKey="k" integration={integration} onBack={vi.fn()} />);
const saveButton = (name: RegExp | string = 'Save') => screen.getByRole('button', { name }) as HTMLButtonElement;
const edit = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'edit first cell' }));
const settle = () => act(async () => {});
const lines = () => Array.from(document.querySelectorAll('.boomi-crt-history-line')).map((el) => el.textContent);
const savedResult = (over: Record<string, unknown> = {}) => ({
  processId: 'p1',
  tableId: 'id-alpha',
  overridden: true,
  rowCount: 2,
  stamp: 'o2.saved',
  ...over,
});

beforeEach(() => {
  ctx.boomiConfig = {};
  for (const m of [fetchTables, saveTable, resetTable, fetchHistory]) m.mockReset();
  fetchTables.mockResolvedValue({ tables: [serverTable('Alpha')] });
  fetchHistory.mockResolvedValue(answer());
});
afterEach(() => {
  registerCrtDataSource(null);
});

describe('the line', () => {
  it('is one line under the chips row, with the time of our record and the user Boomi names for that save', async () => {
    renderScreen();
    await screen.findByRole('grid');
    expect(await screen.findByText(LINE)).toBeTruthy();
    expect(lines()).toEqual([LINE]);
    const history = document.querySelector('.boomi-crt-history') as HTMLElement;
    expect(history.previousElementSibling?.className).toBe('boomi-crt-info');
    // The line is about this table, so it carries no tooltip about the whole environment.
    expect(screen.getByText(LINE).getAttribute('title')).toBeNull();
  });

  it('shows only a date, a time and a user: no account id, no row count, nothing about how the save was made', async () => {
    fetchHistory.mockResolvedValue(
      answer({ environment: { at: ENV_AT, by: 'svc@example.com', viaUi: true }, tables: [tableRecord({ by: 'customer-account-7Q2K', rowCount: 6 })] })
    );
    renderScreen();
    await screen.findByText(LINE);
    const text = (document.querySelector('.boomi-crt-history') as HTMLElement).textContent as string;
    expect(text).not.toMatch(/customer-account|rows?\b|via ui|screen|\bapi\b/i);
  });

  it('uses the host user id of our record when Boomi names no one for that moment', async () => {
    fetchHistory.mockResolvedValue(answer({ environment: null, tables: [tableRecord({ by: 'host-user-7' })] }));
    renderScreen();
    expect(await screen.findByText(`Last saved by host-user-7 on ${shown(SAVED_AT)}`)).toBeTruthy();
  });

  it('shows the time alone when nobody is known', async () => {
    fetchHistory.mockResolvedValue(answer({ environment: null }));
    renderScreen();
    expect(await screen.findByText(`Last saved on ${shown(SAVED_AT)}`)).toBeTruthy();
  });

  it('says that the defaults were restored after a reset', async () => {
    fetchHistory.mockResolvedValue(answer({ tables: [tableRecord({ action: 'reset', rowCount: 0 })] }));
    renderScreen();
    expect(await screen.findByText(`Defaults restored by svc@example.com on ${shown(SAVED_AT)}`)).toBeTruthy();
  });

  it('is built from Boomi alone when we have no record of the table, and then says it is about the whole environment', async () => {
    fetchHistory.mockResolvedValue(answer({ tables: [] }));
    renderScreen();
    const line = await screen.findByText(`Last saved by svc@example.com on ${shown(ENV_AT)}`);
    expect(line.getAttribute('title')).toBe(HINT);
    expect(lines()).toHaveLength(1);
  });

  it('has no line for a table on the defaults that nobody saved', async () => {
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha', { overridden: false, overrideRows: null })] });
    fetchHistory.mockResolvedValue(answer({ tables: [] }));
    renderScreen();
    await screen.findByRole('grid');
    await waitFor(() => expect(fetchHistory).toHaveBeenCalled());
    await settle();
    expect(document.querySelector('.boomi-crt-history')).toBeNull();
  });

  it('shows a save made in the Boomi user interface after ours, because someone else changed it', async () => {
    fetchHistory.mockResolvedValue(answer({ environment: { at: '2026-11-10T08:00:00Z', by: 'pat@example.com', viaUi: true } }));
    renderScreen();
    expect(await screen.findByText(`Last saved by pat@example.com on ${shown('2026-11-10T08:00:00Z')}`)).toBeTruthy();
  });

  it('keeps our record when Boomi shows a later save that was not made in the user interface (another table saved here)', async () => {
    fetchHistory.mockResolvedValue(answer({ environment: { at: '2026-11-10T08:00:00Z', by: 'svc@example.com', viaUi: false } }));
    renderScreen();
    expect(await screen.findByText(`Last saved on ${shown(SAVED_AT)}`)).toBeTruthy();
  });

  it('shows nothing at all when there is nothing to say', async () => {
    fetchHistory.mockResolvedValue({ environment: null, tables: [] });
    renderScreen();
    await screen.findByRole('grid');
    await waitFor(() => expect(fetchHistory).toHaveBeenCalled());
    await settle();
    expect(document.querySelector('.boomi-crt-history')).toBeNull();
  });

  it('follows the open table: another table with no record of ours gets its own line from Boomi', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha'), serverTable('Beta')] });
    renderScreen();
    await screen.findByText(LINE);
    await user.click(screen.getAllByRole('button', { name: /^Table\b/ })[0]);
    await user.click(screen.getAllByRole('option').find((o) => within(o).queryByText('Beta') !== null) as HTMLElement);
    await waitFor(() => expect(screen.getByRole('grid').getAttribute('aria-label')).toMatch(/Beta/));
    expect(lines()).toHaveLength(1);
    expect(document.querySelector('.boomi-crt-history-line')?.getAttribute('title')).toBe(HINT);
  });

  it('matches the process as well as the table id', async () => {
    fetchHistory.mockResolvedValue(answer({ tables: [tableRecord({ processId: 'p2' })] }));
    renderScreen();
    const line = await screen.findByText(`Last saved by svc@example.com on ${shown(ENV_AT)}`);
    expect(line.getAttribute('title')).toBe(HINT);
  });
});

describe('when the history is asked for', () => {
  it('asks only after the tables are ready, so the first paint never waits for it', async () => {
    let finish!: (v: unknown) => void;
    fetchTables.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderScreen();
    await settle();
    expect(screen.getByText('Loading cross reference tables...')).toBeTruthy();
    expect(fetchHistory).not.toHaveBeenCalled();
    await act(async () => finish({ tables: [serverTable('Alpha')] }));
    await screen.findByRole('grid');
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1));
  });

  it('shows the screen at once and fills the lines in later when the history is slow', async () => {
    let finish!: (v: unknown) => void;
    fetchHistory.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderScreen();
    await screen.findByRole('grid');
    expect(lines()).toEqual([]);
    expect(saveButton().disabled).toBe(true);
    await act(async () => finish(answer()));
    expect(await screen.findByText(LINE)).toBeTruthy();
  });

  it('sends the environment, the pack and a cancel signal', async () => {
    renderScreen();
    await screen.findByText(LINE);
    expect(fetchHistory).toHaveBeenCalledTimes(1);
    const args = fetchHistory.mock.calls[0][0];
    expect(args).toMatchObject({ environmentId: 'env-1', integrationPackInstanceId: 'ipi-1' });
    expect(args.signal).toBeInstanceOf(AbortSignal);
    expect(args.signal.aborted).toBe(false);
  });

  it('is not asked again just because the screen re-renders (a cell edit, a table switch)', async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByText(LINE);
    await edit(user);
    await edit(user);
    await settle();
    expect(fetchHistory).toHaveBeenCalledTimes(1);
  });

  it('cancels the request when the screen goes away', async () => {
    let finish!: (v: unknown) => void;
    fetchHistory.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { unmount } = renderScreen();
    await screen.findByRole('grid');
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1));
    const { signal } = fetchHistory.mock.calls[0][0];
    expect(signal.aborted).toBe(false);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    unmount();
    expect(signal.aborted).toBe(true);
    // A late answer is ignored and nothing complains about a screen that is gone.
    await act(async () => finish(answer()));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('is not asked, and no lines show, when the tables come from a registered source', async () => {
    registerCrtDataSource({
      listTables: async () => [
        { id: 'id-alpha', name: 'Alpha', processId: 'p1', processName: 'P', matchType: 'exact', columns: ['a', 'b'], defaultRows: [['1', '2']], overrideRows: null },
      ],
    });
    renderScreen();
    await screen.findByRole('grid');
    await settle();
    expect(fetchHistory).not.toHaveBeenCalled();
    expect(lines()).toEqual([]);
  });
});

describe('nothing to show', () => {
  it('shows nothing and no error for a server without the route (404)', async () => {
    fetchHistory.mockRejectedValue(new HttpError('Not Found', 404));
    renderScreen();
    await screen.findByRole('grid');
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1));
    await settle();
    expect(lines()).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/could not/i)).toBeNull();
  });

  it('shows nothing and no error for any other failure, and the screen still works', async () => {
    const user = userEvent.setup();
    fetchHistory.mockRejectedValue(new HttpError('Boom', 500));
    saveTable.mockResolvedValue(savedResult());
    renderScreen();
    await screen.findByRole('grid');
    await settle();
    expect(lines()).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Table saved.');
  });

  it('shows nothing for a failure with no response at all', async () => {
    fetchHistory.mockRejectedValue(new HttpError('Failed to fetch', 0));
    renderScreen();
    await screen.findByRole('grid');
    await settle();
    expect(lines()).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows nothing when the service call itself throws', async () => {
    fetchHistory.mockImplementation(() => {
      throw new Error('broken');
    });
    renderScreen();
    await screen.findByRole('grid');
    await settle();
    expect(lines()).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows nothing for an answer that is not what was expected', async () => {
    for (const odd of [null, 'text', 42, [], { environment: 'yesterday', tables: 'many' }]) {
      fetchHistory.mockReset();
      fetchHistory.mockResolvedValue(odd);
      const { unmount } = renderScreen();
      await screen.findByRole('grid');
      await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1));
      await settle();
      expect(lines()).toEqual([]);
      expect(screen.queryByRole('alert')).toBeNull();
      unmount();
    }
  });

  it('skips the entries it cannot read and shows the rest', async () => {
    fetchHistory.mockResolvedValue(answer({ tables: [null, { processId: 'p1' }, tableRecord()] }));
    renderScreen();
    await screen.findByText(LINE);
    expect(lines()).toEqual([LINE]);
  });

  it('shows an unreadable date as it came, rather than nothing', async () => {
    fetchHistory.mockResolvedValue(answer({ tables: [], environment: { at: 'sometime', by: 'svc@example.com', viaUi: true } }));
    renderScreen();
    expect(await screen.findByText('Last saved by svc@example.com on sometime')).toBeTruthy();
  });
});

describe('the showHistory setting', () => {
  it('hides the line and makes no request when it is false', async () => {
    ctx.boomiConfig = { components: { k: { crossReferenceTables: { showHistory: false } } } };
    renderScreen();
    await screen.findByRole('grid');
    await settle();
    expect(fetchHistory).not.toHaveBeenCalled();
    expect(lines()).toEqual([]);
    expect(screen.queryByText(/Last saved/)).toBeNull();
  });

  it('still makes no request after a save when it is false', async () => {
    const user = userEvent.setup();
    ctx.boomiConfig = { components: { k: { crossReferenceTables: { showHistory: false } } } };
    saveTable.mockResolvedValue(savedResult());
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Table saved.');
    expect(fetchHistory).not.toHaveBeenCalled();
  });

  it('shows the lines when it is true, or not set, or set for another component', async () => {
    for (const config of [
      { components: { k: { crossReferenceTables: { showHistory: true } } } },
      { components: { k: { crossReferenceTables: {} } } },
      { components: { other: { crossReferenceTables: { showHistory: false } } } },
      {},
    ]) {
      ctx.boomiConfig = config;
      fetchHistory.mockClear();
      const { unmount } = renderScreen();
      expect(await screen.findByText(LINE)).toBeTruthy();
      expect(fetchHistory).toHaveBeenCalledTimes(1);
      unmount();
    }
  });
});

describe('after a save or a reset', () => {
  it('asks again and shows the new line', async () => {
    const user = userEvent.setup();
    saveTable.mockResolvedValue(savedResult());
    renderScreen();
    await screen.findByText(LINE);
    fetchHistory.mockResolvedValue(
      answer({
        environment: { at: '2026-11-10T08:00:00Z', by: 'me@example.com', viaUi: true },
        tables: [tableRecord({ at: '2026-11-10T08:00:00Z', by: 'me@example.com', rowCount: 2 })],
      })
    );
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Table saved.');
    expect(await screen.findByText(`Last saved by me@example.com on ${shown('2026-11-10T08:00:00Z')}`)).toBeTruthy();
    expect(screen.queryByText(LINE)).toBeNull();
    expect(fetchHistory).toHaveBeenCalledTimes(2);
  });

  it('asks again after a reset, and the line then says the defaults were restored', async () => {
    const user = userEvent.setup();
    resetTable.mockResolvedValue(savedResult({ overridden: false, rowCount: 0, stamp: 'd0.reset' }));
    renderScreen();
    await screen.findByText(LINE);
    fetchHistory.mockResolvedValue(answer({ tables: [tableRecord({ action: 'reset', rowCount: 0, by: 'me@example.com' })] }));
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await user.click(saveButton('Restore defaults'));
    await screen.findByText('Default values restored.');
    // Our record gives the time; the user is the one Boomi names for that save.
    expect(await screen.findByText(`Defaults restored by svc@example.com on ${shown(SAVED_AT)}`)).toBeTruthy();
    expect(fetchHistory).toHaveBeenCalledTimes(2);
  });

  it('does not wait for the answer: the save is finished and the screen usable while it is pending', async () => {
    const user = userEvent.setup();
    saveTable.mockResolvedValue(savedResult());
    renderScreen();
    await screen.findByText(LINE);
    let finish!: (v: unknown) => void;
    fetchHistory.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Table saved.');
    expect(screen.queryByText('Saving...')).toBeNull();
    expect(document.querySelector('.boomi-crt-screen')?.hasAttribute('inert')).toBe(false);
    await act(async () => finish(answer({ tables: [] })));
    await waitFor(() => expect(lines()).toHaveLength(1));
  });

  it('does not ask after a save that failed', async () => {
    const user = userEvent.setup();
    saveTable.mockRejectedValue(new HttpError('failed', 502, { code: 'BOOMI_REJECTED', error: 'failed' }));
    renderScreen();
    await screen.findByText(LINE);
    await edit(user);
    await user.click(saveButton());
    await screen.findByRole('alert');
    expect(fetchHistory).toHaveBeenCalledTimes(1);
  });

  it('drops the old lines when the new answer fails, rather than keep saying something that is no longer true', async () => {
    const user = userEvent.setup();
    saveTable.mockResolvedValue(savedResult());
    renderScreen();
    await screen.findByText(LINE);
    fetchHistory.mockRejectedValue(new HttpError('Boom', 500));
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Table saved.');
    await waitFor(() => expect(lines()).toEqual([]));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the save a success even when asking again throws at once', async () => {
    const user = userEvent.setup();
    saveTable.mockResolvedValue(savedResult());
    renderScreen();
    await screen.findByText(LINE);
    fetchHistory.mockImplementation(() => {
      throw new Error('broken');
    });
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Table saved.');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('No changes to save')).toBeTruthy();
  });

  it('ignores an older answer that arrives after a newer one', async () => {
    const user = userEvent.setup();
    saveTable.mockResolvedValue(savedResult());
    renderScreen();
    await screen.findByText(LINE);
    // The first request after the save never finishes on its own; the screen asks again on the next save.
    let finishOld!: (v: unknown) => void;
    fetchHistory.mockReturnValueOnce(new Promise((resolve) => (finishOld = resolve)));
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Table saved.');
    const oldSignal = fetchHistory.mock.calls[1][0].signal as AbortSignal;
    fetchHistory.mockResolvedValue(answer({ environment: null, tables: [tableRecord({ by: 'newer@example.com' })] }));
    await edit(user);
    await user.click(saveButton());
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(3));
    expect(oldSignal.aborted).toBe(true);
    await screen.findByText(`Last saved by newer@example.com on ${shown(SAVED_AT)}`);
    await act(async () => finishOld(answer()));
    expect(lines()).toEqual([`Last saved by newer@example.com on ${shown(SAVED_AT)}`]);
  });
});
