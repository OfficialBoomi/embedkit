/**
 * @file UpdateCrossReferencesDialogs.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * How the cross reference table screen behaves around its windows, for the keyboard and for a screen
 * reader: the conflict window and the shared save window are named, take focus, keep Tab inside, close
 * on Escape where closing is allowed and leave the screen behind them inert; the wait window cannot be
 * closed; the cursor and the scroll position survive a save, a reset or a reload; focus comes back to the
 * table as soon as only a toast is on screen; the load error box in the wizard has no dead close button;
 * and a failed save is announced as an alert. The real shared Modal and Dialog are used here, with a
 * stand-in grid and toolbar like the other screen tests.
 *
 * Not covered, and only checkable in a browser: that `inert` really stops focus and clicks (jsdom does not
 * implement it), and how the windows look.
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
/** What the stand-in grid reports and is asked to do. */
const grid = vi.hoisted(() => ({
  active: { row: 0, col: 0 },
  scroll: { top: 0, left: 0 },
  showCell: vi.fn(),
  scrollTo: vi.fn(),
}));

vi.mock('../../context/pluginContext', () => ({ usePlugin: () => ctx, usePluginOptional: () => ctx }));
vi.mock('../../hooks/useDialogs', () => ({ useDialogs: () => ({ confirm: vi.fn(async () => true), alert: vi.fn() }) }));
vi.mock('../../events.service', () => ({ emitEmbedKitEvent: vi.fn() }));
vi.mock('../../logger.service', () => ({
  default: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
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
vi.mock('../../components/ui/ToastNotification', () => ({
  default: ({ content }: { content: string }) => <div role="status">{content}</div>,
}));
vi.mock('../../components/integration/crt/CrtToolbar', () => ({
  default: ({ trailing }: { trailing?: React.ReactNode }) => (
    <div>
      <button type="button">toolbar button</button>
      {trailing}
    </div>
  ),
}));
vi.mock('../../components/integration/crt/CrtGrid', () => ({
  default: forwardRef<
    unknown,
    { ariaLabel: string; store: { setCell: (r: number, c: number, v: string) => boolean; getCell: (r: number, c: number) => string } }
  >(({ ariaLabel, store }, ref) => {
    useImperativeHandle(
      ref,
      () => ({
        run: () => {},
        focus: () => {},
        commitEdit: () => {},
        activeCell: () => grid.active,
        showCell: grid.showCell,
        scrollPosition: () => grid.scroll,
        scrollTo: grid.scrollTo,
      }),
      []
    );
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
  overrideRows: [['x', '1'], ['y', '2'], ['z', '3']],
  stamp: 'o3.mine',
  ...over,
});
const second = (name: string, over: Record<string, unknown> = {}) =>
  serverTable(name, { processId: 'p2', processName: 'Pack - Second', stamp: 'o3.second', ...over });
const shared = () => ({ tables: [serverTable('Alpha'), second('Alpha', { overridden: false, overrideRows: null, stamp: 'd0.second' })] });
const single = () => ({ tables: [serverTable('Alpha')] });

const ok = (processId: string, stamp = 'o3.after') => ({ processId, tableId: 'id-alpha', overridden: true, rowCount: 3, stamp });
const problem = (status: number, code?: string, extra: Record<string, unknown> = {}) =>
  new HttpError('failed', status, code ? { code, error: 'failed', ...extra } : undefined);

const renderScreen = (props: Record<string, unknown> = {}) =>
  render(<UpdateCrossReferences componentKey="k" integration={integration} onBack={vi.fn()} {...props} />);
const screenEl = () => document.querySelector('.boomi-crt-screen') as HTMLElement;
const gridEl = () => screen.getByRole('grid');
const edit = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'edit first cell' }));
const saveButton = (name: RegExp | string = 'Save') => screen.getByRole('button', { name }) as HTMLButtonElement;
const nap = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

/** Opens the screen on a table with edits and a save that finds the table changed. */
async function openConflict(user: ReturnType<typeof userEvent.setup>) {
  fetchTables.mockResolvedValue(single());
  saveTable.mockRejectedValueOnce(problem(409, 'TABLE_CHANGED', { currentStamp: 'o3.theirs' }));
  renderScreen();
  await screen.findByRole('grid');
  await edit(user);
  await user.click(saveButton());
  return screen.findByRole('dialog', { name: 'This table was changed' });
}

/** Opens the screen on a shared table with edits and the "other processes" window. */
async function openScope(user: ReturnType<typeof userEvent.setup>) {
  fetchTables.mockResolvedValue(shared());
  renderScreen();
  await screen.findByRole('grid');
  await edit(user);
  await user.click(screen.getByRole('button', { name: 'More ways to save' }));
  await user.click(screen.getByRole('menuitem'));
  return screen.findByRole('dialog', { name: 'Save to other processes' });
}

beforeEach(() => {
  ctx.boomiConfig = {};
  for (const m of [fetchTables, saveTable, resetTable, fetchHistory, grid.showCell, grid.scrollTo]) m.mockReset();
  fetchHistory.mockResolvedValue({ environment: null, tables: [] });
  grid.active = { row: 0, col: 0 };
  grid.scroll = { top: 0, left: 0 };
});
afterEach(() => {
  registerCrtDataSource(null);
  document.querySelectorAll('.swal2-container').forEach((el) => el.remove());
});

describe('the conflict window', () => {
  it('is a named dialog, and focus lands on Keep editing, the choice that changes nothing', async () => {
    const user = userEvent.setup();
    const dialog = await openConflict(user);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading', { name: 'This table was changed' })).toBeTruthy();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus());
  });

  it('keeps Tab and Shift+Tab inside the window, wrapping at both ends', async () => {
    const user = userEvent.setup();
    const dialog = await openConflict(user);
    const names = ['Keep editing', 'Reload table', 'Overwrite', 'Close modal'];
    // From Keep editing forward: Reload table, Overwrite, then round to the first control (the close icon).
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
      seen.push(document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '');
    }
    expect(seen.slice(0, 4)).toEqual(['Reload table', 'Overwrite', 'Close modal', 'Keep editing']);
    for (const name of names) expect(seen).toContain(name);
    // And backwards from the first control to the last.
    (within(dialog).getByRole('button', { name: 'Close modal' })).focus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Overwrite' })).toHaveFocus();
    (within(dialog).getByRole('button', { name: 'Close modal' })).focus();
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('puts Overwrite at the end of the loop: Tab from the last control goes to the first', async () => {
    const user = userEvent.setup();
    const dialog = await openConflict(user);
    within(dialog).getByRole('button', { name: 'Overwrite' }).focus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Close modal' })).toHaveFocus();
  });

  it('Escape is Keep editing: the window closes and nothing was written', async () => {
    const user = userEvent.setup();
    await openConflict(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(saveTable).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1 row changed')).toBeTruthy();
    expect(screenEl().hasAttribute('inert')).toBe(false);
  });

  it('does not let Escape or any key reach the screen behind it', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(single());
    saveTable.mockRejectedValueOnce(problem(409, 'TABLE_CHANGED'));
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <UpdateCrossReferences componentKey="k" integration={integration} onBack={vi.fn()} />
      </div>
    );
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());
    await screen.findByRole('dialog', { name: 'This table was changed' });
    outer.mockClear();
    await user.keyboard('{Tab}a{Escape}');
    expect(outer).not.toHaveBeenCalled();
  });

  it('leaves the screen behind it inert while it is open, so the grid and the toolbar cannot be reached', async () => {
    const user = userEvent.setup();
    const dialog = await openConflict(user);
    expect(screenEl().hasAttribute('inert')).toBe(true);
    expect(screenEl().contains(dialog)).toBe(false);
    // The window is not inside the inert part, so its own buttons still work.
    expect(screenEl().querySelector('[role="dialog"]')).toBeNull();
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(screenEl().contains(document.activeElement)).toBe(false);
    }
  });

  it('is inert only while it is open: the screen is usable again and takes focus back when it closes', async () => {
    const user = userEvent.setup();
    const dialog = await openConflict(user);
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(screenEl().hasAttribute('inert')).toBe(false);
    await waitFor(() => expect(gridEl()).toHaveFocus());
  });

  it('Overwrite still works from the keyboard', async () => {
    const user = userEvent.setup();
    const dialog = await openConflict(user);
    saveTable.mockResolvedValue(ok('p1'));
    within(dialog).getByRole('button', { name: 'Overwrite' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByText('Table saved.');
    expect(saveTable).toHaveBeenCalledTimes(2);
  });
});

describe('the shared save window', () => {
  it('is a named dialog, and focus lands on the first checkbox', async () => {
    const user = userEvent.setup();
    const dialog = await openScope(user);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(within(dialog).getByRole('checkbox')).toHaveFocus());
  });

  it('is named for a reset too', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({
      tables: [serverTable('Alpha'), second('Alpha', { overridden: true, overrideRows: [['q', '9']], stamp: 'o1.second' })],
    });
    renderScreen();
    await screen.findByRole('grid');
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await nap(60);
    await user.click(screen.getByRole('button', { name: 'More ways to save' }));
    await user.click(screen.getByRole('menuitem'));
    const dialog = await screen.findByRole('dialog', { name: 'Restore defaults in other processes' });
    await waitFor(() => expect(within(dialog).getByRole('checkbox')).toHaveFocus());
  });

  it('falls to the confirm button when no checkbox can be changed', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({
      tables: [serverTable('Alpha'), second('Alpha', { overrideRows: [['EDITED', '1'], ['y', '2'], ['z', '3']], stamp: 'o3.same' })],
    });
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(screen.getByRole('button', { name: 'More ways to save' }));
    await user.click(screen.getByRole('menuitem'));
    const dialog = await screen.findByRole('dialog', { name: 'Save to other processes' });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Save to 1 process' })).toHaveFocus());
  });

  it('keeps Tab inside the window, wrapping from the last control to the first and back', async () => {
    const user = userEvent.setup();
    const dialog = await openScope(user);
    within(dialog).getByRole('button', { name: 'Save to 2 processes' }).focus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Close modal' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Save to 2 processes' })).toHaveFocus();
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('leaves the screen behind it inert', async () => {
    const user = userEvent.setup();
    const dialog = await openScope(user);
    expect(screenEl().hasAttribute('inert')).toBe(true);
    expect(screenEl().contains(dialog)).toBe(false);
  });

  it('Escape closes it while choosing, and nothing is written', async () => {
    const user = userEvent.setup();
    await openScope(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(saveTable).not.toHaveBeenCalled();
    expect(screenEl().hasAttribute('inert')).toBe(false);
    await waitFor(() => expect(gridEl()).toHaveFocus());
  });

  it('while the saves run focus is on the window itself and Escape does nothing; when they are done Close has focus and Escape closes', async () => {
    const user = userEvent.setup();
    const dialog = await openScope(user);
    let finishFirst!: (v: unknown) => void;
    saveTable.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)));
    saveTable.mockImplementation(async (a: { processId: string }) => ok(a.processId));
    await user.click(within(dialog).getByRole('button', { name: 'Save to 2 processes' }));

    // Running: the buttons are gone and focus is on the dialog element, which is named.
    await waitFor(() => expect(within(dialog).getByRole('list', { name: 'Progress' })).toBeTruthy());
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).toBeNull();
    await waitFor(() => expect(dialog).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Save to other processes' })).toBeTruthy();
    // Tab stays inside while it runs.
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await act(async () => finishFirst(ok('p1')));
    const close = await within(dialog).findByRole('button', { name: 'Close' });
    await waitFor(() => expect(close).toHaveFocus());
    expect(screenEl().hasAttribute('inert')).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screenEl().hasAttribute('inert')).toBe(false);
  });

  it('a retry that is offered has focus order and Escape like any other done window', async () => {
    const user = userEvent.setup();
    const dialog = await openScope(user);
    saveTable.mockImplementation(async (a: { processId: string }) => {
      if (a.processId === 'p2') throw problem(503, 'THROTTLED');
      return ok(a.processId);
    });
    await user.click(within(dialog).getByRole('button', { name: 'Save to 2 processes' }));
    const close = await within(dialog).findByRole('button', { name: 'Close' });
    await within(dialog).findByRole('button', { name: 'Retry 1 failed process' });
    await waitFor(() => expect(close).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the wait window', () => {
  it('has a name, no way to close it, and Escape does nothing', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(single());
    let finish!: (v: unknown) => void;
    saveTable.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());
    const busy = await screen.findByRole('alertdialog', { name: 'Saving...' });
    expect(busy).toHaveAttribute('aria-modal', 'true');
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(within(busy).queryByRole('button')).toBeNull();
    expect(screenEl().hasAttribute('inert')).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog', { name: 'Saving...' })).toBeTruthy();
    await act(async () => finish(ok('p1')));
    await screen.findByText('Table saved.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('keeping the user\'s place across a save, a reset and a reload', () => {
  it('puts the cursor and the scroll position back after a save', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(single());
    saveTable.mockResolvedValue(ok('p1'));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    grid.active = { row: 2, col: 1 };
    grid.scroll = { top: 96, left: 4 };
    grid.showCell.mockClear();
    await user.click(saveButton());
    await screen.findByText('Table saved.');
    expect(grid.showCell).toHaveBeenCalledTimes(1);
    expect(grid.showCell).toHaveBeenCalledWith(2, 1);
    expect(grid.scrollTo).toHaveBeenCalledTimes(1);
    expect(grid.scrollTo).toHaveBeenCalledWith(96, 4);
  });

  it('pulls the cell back inside a table that came back smaller', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(single());
    saveTable.mockRejectedValueOnce(problem(409, 'TABLE_CHANGED', { currentStamp: 'o1.theirs' }));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());
    await screen.findByRole('dialog', { name: 'This table was changed' });
    grid.active = { row: 2, col: 5 };
    grid.scroll = { top: 64, left: 0 };
    // The other version has one row and two columns.
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha', { overrideRows: [['theirs', '9']], stamp: 'o1.theirs' })] });
    grid.showCell.mockClear();
    await user.click(screen.getByRole('button', { name: 'Reload table' }));
    await waitFor(() => expect(screen.getByText('No changes to save')).toBeTruthy());
    expect(grid.showCell).toHaveBeenCalledTimes(1);
    expect(grid.showCell).toHaveBeenCalledWith(0, 1);
    expect(grid.scrollTo).toHaveBeenCalledWith(64, 0);
  });

  it('does the same after a reset', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(single());
    resetTable.mockResolvedValue({ processId: 'p1', tableId: 'id-alpha', overridden: false, rowCount: 0, stamp: 'd0.reset' });
    renderScreen();
    await screen.findByRole('grid');
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await nap(60);
    grid.active = { row: 1, col: 0 };
    grid.showCell.mockClear();
    await user.click(saveButton('Restore defaults'));
    await screen.findByText('Default values restored.');
    expect(grid.showCell).toHaveBeenCalledTimes(1);
    // The defaults have two rows.
    expect(grid.showCell).toHaveBeenCalledWith(1, 0);
  });

  it('only the open table is put back: saving other processes does not move the cursor again', async () => {
    const user = userEvent.setup();
    const dialog = await openScope(user);
    saveTable.mockImplementation(async (a: { processId: string }) => ok(a.processId));
    grid.active = { row: 1, col: 1 };
    grid.showCell.mockClear();
    await user.click(within(dialog).getByRole('button', { name: 'Save to 2 processes' }));
    await within(dialog).findByRole('button', { name: 'Close' });
    expect(saveTable).toHaveBeenCalledTimes(2);
    expect(grid.showCell).toHaveBeenCalledTimes(1);
    expect(grid.showCell).toHaveBeenCalledWith(1, 1);
  });

  it('a failed save changes nothing: the grid is not touched', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(single());
    saveTable.mockRejectedValue(problem(502, 'BOOMI_REJECTED'));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    grid.showCell.mockClear();
    await user.click(saveButton());
    await screen.findByRole('alert');
    expect(grid.showCell).not.toHaveBeenCalled();
    expect(grid.scrollTo).not.toHaveBeenCalled();
  });

  it('opening another table is not a commit, so nothing is restored', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({
      tables: [serverTable('Alpha'), serverTable('Beta', { id: 'id-beta' })],
    });
    renderScreen();
    await screen.findByRole('grid');
    grid.showCell.mockClear();
    await user.click(screen.getAllByRole('button', { name: /Beta|Alpha/ })[0]);
    expect(grid.showCell).not.toHaveBeenCalled();
  });
});

describe('focus after a save', () => {
  const fakeSwal = (popupClass: string) => {
    const container = document.createElement('div');
    container.className = 'swal2-container';
    const popup = document.createElement('div');
    popup.className = `swal2-popup ${popupClass}`;
    container.appendChild(popup);
    document.body.appendChild(container);
    return container;
  };

  it('returns to the table at once when only a toast is on screen', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(single());
    saveTable.mockResolvedValue(ok('p1'));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    // SweetAlert2's toast: the container exists but the popup is a toast, which never hides the page.
    fakeSwal('swal2-toast');
    await user.click(saveButton());
    await screen.findByText('Table saved.');
    // The old wait for any container would take about a second and a half.
    await waitFor(() => expect(gridEl()).toHaveFocus(), { timeout: 500 });
  });

  it('still waits for a real dialog to leave, then takes focus', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(single());
    saveTable.mockResolvedValue(ok('p1'));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    const dialog = fakeSwal('swal2-modal');
    await user.click(saveButton());
    await screen.findByText('Table saved.');
    await nap(150);
    expect(gridEl()).not.toHaveFocus();
    dialog.remove();
    await waitFor(() => expect(gridEl()).toHaveFocus(), { timeout: 500 });
  });

  it('takes focus at once when nothing from SweetAlert2 is up', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(single());
    saveTable.mockResolvedValue(ok('p1'));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Table saved.');
    await waitFor(() => expect(gridEl()).toHaveFocus(), { timeout: 500 });
  });
});

describe('the load error box', () => {
  const failLoad = () => fetchTables.mockRejectedValue(new HttpError('The server is down', 500));

  it('has no close button in the wizard, where it would do nothing, and keeps Try again', async () => {
    failLoad();
    render(<UpdateCrossReferences componentKey="k" integration={integration} wizard active />);
    await screen.findByText('Could not load cross reference tables');
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('keeps its close button when the screen stands alone, and it goes back', async () => {
    const user = userEvent.setup();
    failLoad();
    const onBack = vi.fn();
    renderScreen({ onBack });
    await screen.findByText('Could not load cross reference tables');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('standing alone with no way back is unchanged: the button is still there', async () => {
    failLoad();
    renderScreen({ onBack: undefined });
    await screen.findByText('Could not load cross reference tables');
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});

describe('a failed save is announced', () => {
  it('the box is an alert, so a screen reader reads it, and focus is not moved to it', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(single());
    saveTable.mockRejectedValue(problem(502, 'BOOMI_REJECTED'));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(saveButton());
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Could not save')).toBeTruthy();
    expect(within(alert).getByText(/did not accept the save/)).toBeTruthy();
    await nap(60);
    expect(alert.contains(document.activeElement)).toBe(false);
    expect(screenEl().contains(alert)).toBe(true);
  });

  it('goes away when it is dismissed', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(single());
    saveTable.mockRejectedValue(problem(502, 'BOOMI_REJECTED'));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the timeout sentence is announced the same way', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue(single());
    saveTable.mockRejectedValue(problem(503));
    renderScreen();
    await screen.findByRole('grid');
    await edit(user);
    await user.click(saveButton());
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/did not answer in time/)).toBeTruthy();
  });
});
