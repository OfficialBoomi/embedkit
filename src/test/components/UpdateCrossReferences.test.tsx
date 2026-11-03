/**
 * @file UpdateCrossReferences.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Screen level tests for the cross reference table screen: the unsaved changes guard (the Cancel
 * button and the breadcrumb), the dots that mark every table with unsaved edits, tables that
 * cannot be edited (disabled or hidden by config), and the empty states. The grid and the toolbar
 * are replaced by small stand-ins, because jsdom has no layout for the virtualized grid and
 * both are covered by their own tests. The picker is the real one.
 *
 * Not covered here, and only checkable in a browser: that focus really returns to the grid after
 * a real dialog closes, and how the dots and the empty list look.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ctx = vi.hoisted(() => ({
  boomiConfig: {} as Record<string, unknown>,
  renderComponent: vi.fn(),
}));
const confirm = vi.hoisted(() => vi.fn());
// Counts store subscriptions that are still open, to prove the screen lets go of every one.
const subs = vi.hoisted(() => ({ active: 0 }));

vi.mock('../../context/pluginContext', () => ({
  usePlugin: () => ctx,
}));
vi.mock('../../hooks/useDialogs', () => ({
  useDialogs: () => ({ confirm, alert: vi.fn() }),
}));
// The real breadcrumb runs `callbackOne || (() => {})`; the stand-in does the same.
vi.mock('../../components/core/Page', () => ({
  default: ({
    bodyContent,
    callbackOne,
    levelOne,
  }: {
    bodyContent: React.ReactNode;
    callbackOne?: () => void;
    levelOne?: string;
  }) => (
    <div>
      <button type="button" onClick={() => (callbackOne || (() => {}))()}>
        {levelOne}
      </button>
      {bodyContent}
    </div>
  ),
}));
vi.mock('../../components/ui/Dialog', () => ({
  default: ({ error }: { error?: { header: string; message: string } }) =>
    error ? <div role="alertdialog">{error.header}</div> : null,
}));
vi.mock('../../components/integration/crt/CrtToolbar', () => ({
  default: ({
    trailing,
    onToggleFullScreen,
  }: {
    trailing?: React.ReactNode;
    onToggleFullScreen: () => void;
  }) => (
    <div>
      {trailing}
      <button type="button" onClick={onToggleFullScreen}>
        Toggle full screen
      </button>
    </div>
  ),
}));
// A grid that can edit and undo its store, which is all the screen needs to see.
vi.mock('../../components/integration/crt/CrtGrid', () => ({
  default: forwardRef<
    unknown,
    { store: import('../../utils/crt/crtStore').CrtStore; ariaLabel: string }
  >(({ store, ariaLabel }, ref) => {
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
        <button type="button" aria-label={`Undo ${ariaLabel}`} onClick={() => store.undo()} />
      </div>
    );
  }),
}));
vi.mock('../../utils/crt/crtStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/crt/crtStore')>();
  return {
    ...actual,
    createCrtStore: (table: Parameters<typeof actual.createCrtStore>[0]) => {
      const store = actual.createCrtStore(table);
      return {
        ...store,
        subscribe: (listener: () => void) => {
          subs.active += 1;
          const off = store.subscribe(listener);
          let open = true;
          return () => {
            if (open) subs.active -= 1;
            open = false;
            off();
          };
        },
      };
    },
  };
});

import UpdateCrossReferences from '../../components/integration/UpdateCrossReferences';
import { registerCrtDataSource } from '../../utils/crt/crtDataSource';
import type { CrtTableData } from '../../utils/crt/crtTypes';

const integration = { id: 'ipi-1', integrationPackName: 'Pack' } as never;

const table = (name: string, extra: Partial<CrtTableData> = {}): CrtTableData => ({
  id: `id-${name.toLowerCase().replace(/\W+/g, '-')}`,
  name,
  processId: 'p1',
  processName: 'Store Sync',
  matchType: 'exact',
  columns: ['code', 'value'],
  defaultRows: [
    ['a', '1'],
    ['b', '2'],
  ],
  overrideRows: null,
  ...extra,
});

// A table that already has the customer's rows. Overriding a default table is itself a change, so
// only a table like this can become clean again by undoing a cell edit.
const overridden = (name: string): CrtTableData =>
  table(name, {
    overrideRows: [
      ['a', '1'],
      ['b', '2'],
    ],
  });

const broken = (name: string, reason: string): CrtTableData =>
  table(name, { columns: [], defaultRows: [], unavailableReason: reason });

const BROKEN = 'The table definition could not be read';
const RUNTIME = 'Runtime specific tables cannot be edited here';

// Four tables that can be edited and three that cannot: seven options, so the picker's search box
// shows. 'Aaa Broken' sorts before every editable table, to prove it is never the one selected.
const MIXED: CrtTableData[] = [
  table('Alpha'),
  table('Beta'),
  table('Delta'),
  table('Gamma'),
  broken('Aaa Broken', BROKEN),
  broken('Runtime Only', RUNTIME),
  broken('Zeta Broken', BROKEN),
];

const config = (crt: Record<string, unknown>) => ({
  components: { k: { crossReferenceTables: crt } },
});

const renderScreen = async (tables: CrtTableData[], props: { onBack?: () => void } = {}) => {
  registerCrtDataSource({ listTables: async () => tables });
  const utils = render(
    <UpdateCrossReferences componentKey="k" integration={integration} {...props} />
  );
  if (tables.some((t) => !t.unavailableReason)) await screen.findByRole('grid');
  else await screen.findByText('No editable cross reference tables');
  return utils;
};

const user = () => userEvent.setup();
const pickerButton = () => screen.getAllByRole('button', { name: /^Table\b/ })[0];
const edit = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Edit ${name} `) }));
const undo = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Undo ${name} `) }));
const clickCancel = () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
const clickBreadcrumb = () => fireEvent.click(screen.getByRole('button', { name: 'My Integrations' }));
const option = (name: string): HTMLElement =>
  screen.getAllByRole('option').find((o) => within(o).queryByText(name) !== null) as HTMLElement;
const hasDot = (el: HTMLElement) => within(el).queryByRole('img', { name: 'Unsaved changes' }) !== null;
const settle = () => act(async () => {});

/** Opens the picker and chooses a table by name. */
async function switchTo(u: ReturnType<typeof user>, name: string) {
  await u.click(pickerButton());
  await u.click(option(name));
}

const LEFT = { component: 'Integrations', props: { componentKey: 'k' } };

beforeEach(() => {
  ctx.boomiConfig = {};
  ctx.renderComponent.mockReset();
  confirm.mockReset();
  confirm.mockResolvedValue(false);
  subs.active = 0;
});

afterEach(() => {
  registerCrtDataSource(null);
});

describe('unsaved changes guard: Cancel', () => {
  it('leaves at once, with no dialog, when no table has changes', async () => {
    await renderScreen([table('Alpha'), table('Beta')]);
    clickCancel();

    expect(confirm).not.toHaveBeenCalled();
    expect(ctx.renderComponent).toHaveBeenCalledWith(LEFT);
  });

  it('asks first when the selected table has changes, with the agreed wording', async () => {
    await renderScreen([table('Alpha'), table('Beta')]);
    edit('Alpha');
    clickCancel();

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledWith({
      title: 'Discard your changes?',
      description: 'One table has unsaved changes. Leaving now discards them.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
      destructive: true,
    });
  });

  it('stays, changes nothing and keeps the edits when the answer is no', async () => {
    await renderScreen([table('Alpha'), table('Beta')]);
    edit('Alpha');
    clickCancel();
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    await settle();

    expect(ctx.renderComponent).not.toHaveBeenCalled();
    expect(screen.getByRole('grid')).toBeTruthy();
    expect(hasDot(pickerButton())).toBe(true);
  });

  it('leaves when the answer is yes', async () => {
    confirm.mockResolvedValue(true);
    await renderScreen([table('Alpha'), table('Beta')]);
    edit('Alpha');
    clickCancel();

    await waitFor(() => expect(ctx.renderComponent).toHaveBeenCalledWith(LEFT));
    expect(ctx.renderComponent).toHaveBeenCalledTimes(1);
  });

  it('asks about a table the user switched away from, and counts every changed table', async () => {
    const u = user();
    await renderScreen([table('Alpha'), table('Beta'), table('Delta')]);
    edit('Alpha');
    await switchTo(u, 'Beta');
    clickCancel();
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0].description).toBe(
      'One table has unsaved changes. Leaving now discards them.'
    );
    await settle();

    edit('Beta');
    clickCancel();
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(confirm.mock.calls[1][0].description).toBe(
      '2 tables have unsaved changes. Leaving now discards them.'
    );
  });

  it('does not ask once every change is undone', async () => {
    await renderScreen([overridden('Alpha')]);
    edit('Alpha');
    undo('Alpha');
    clickCancel();

    expect(confirm).not.toHaveBeenCalled();
    expect(ctx.renderComponent).toHaveBeenCalledWith(LEFT);
  });

  it('does not ask after Reset to defaults has discarded the changes', async () => {
    confirm.mockResolvedValue(true);
    await renderScreen([table('Alpha')]);
    edit('Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hasDot(pickerButton())).toBe(false));

    clickCancel();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(ctx.renderComponent).toHaveBeenCalledWith(LEFT);
  });

  it('opens one dialog only, however often the button is pressed, and works again after', async () => {
    let answer: (leave: boolean) => void = () => {};
    confirm.mockImplementation(() => new Promise<boolean>((resolve) => (answer = resolve)));
    await renderScreen([table('Alpha')], { onBack: vi.fn() });
    edit('Alpha');
    clickCancel();
    clickCancel();
    // The breadcrumb shares the same guard, so it cannot open a second dialog either.
    clickBreadcrumb();
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));

    await act(async () => answer(false));
    clickCancel();
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
  });

  it('lets go of the grid before the dialog opens and takes focus back when the user stays', async () => {
    await renderScreen([table('Alpha')]);
    edit('Alpha');
    const grid = screen.getByRole('grid');
    grid.focus();
    expect(document.activeElement).toBe(grid);
    const focusedAtOpen: boolean[] = [];
    confirm.mockImplementation(async () => {
      focusedAtOpen.push(document.activeElement === grid);
      return false;
    });

    clickCancel();
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(focusedAtOpen).toEqual([false]);
    await waitFor(() => expect(document.activeElement).toBe(grid));
  });
});

describe('unsaved changes guard: breadcrumb', () => {
  it('goes back at once, with no dialog, when no table has changes', async () => {
    const onBack = vi.fn();
    await renderScreen([table('Alpha')], { onBack });
    clickBreadcrumb();

    expect(confirm).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('asks first when a table has changes and stays on a no', async () => {
    const onBack = vi.fn();
    await renderScreen([table('Alpha')], { onBack });
    edit('Alpha');
    clickBreadcrumb();

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm.mock.calls[0][0].title).toBe('Discard your changes?');
    await settle();
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByRole('grid')).toBeTruthy();
  });

  it('goes back after a yes', async () => {
    confirm.mockResolvedValue(true);
    const onBack = vi.fn();
    await renderScreen([table('Alpha')], { onBack });
    edit('Alpha');
    clickBreadcrumb();

    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it('does nothing, and asks nothing, when the screen has no back callback', async () => {
    await renderScreen([table('Alpha')]);
    edit('Alpha');
    clickBreadcrumb();
    await settle();

    expect(confirm).not.toHaveBeenCalled();
    expect(ctx.renderComponent).not.toHaveBeenCalled();
  });
});

describe('unsaved dots', () => {
  it('marks the selected table and every table the user switched away from', async () => {
    const u = user();
    await renderScreen([table('Alpha'), table('Beta'), table('Delta')]);
    expect(hasDot(pickerButton())).toBe(false);

    edit('Alpha');
    expect(hasDot(pickerButton())).toBe(true);

    await switchTo(u, 'Beta');
    expect(hasDot(pickerButton())).toBe(false);
    await u.click(pickerButton());
    expect(hasDot(option('Alpha'))).toBe(true);
    expect(hasDot(option('Beta'))).toBe(false);
    expect(hasDot(option('Delta'))).toBe(false);
  });

  it('keeps the dot of an earlier table while another table is edited, and clears each on undo', async () => {
    const u = user();
    await renderScreen([overridden('Alpha'), overridden('Beta')]);
    edit('Alpha');
    await switchTo(u, 'Beta');
    edit('Beta');
    await u.click(pickerButton());
    expect(hasDot(option('Alpha'))).toBe(true);
    expect(hasDot(option('Beta'))).toBe(true);
    await u.keyboard('{Escape}');

    undo('Beta');
    await u.click(pickerButton());
    expect(hasDot(option('Alpha'))).toBe(true);
    expect(hasDot(option('Beta'))).toBe(false);
  });

  it('shows the dot in the full screen caption picker too', async () => {
    await renderScreen([table('Alpha'), table('Beta')]);
    edit('Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Toggle full screen' }));

    const compact = screen.getByRole('button', { name: 'Table: Alpha (unsaved changes)' });
    expect(hasDot(compact)).toBe(true);
  });

  it('lets go of every store subscription when the screen unmounts', async () => {
    const u = user();
    const { unmount } = await renderScreen([table('Alpha'), table('Beta')]);
    edit('Alpha');
    await switchTo(u, 'Beta');
    expect(subs.active).toBeGreaterThan(0);

    unmount();
    expect(subs.active).toBe(0);
  });
});

describe('tables that cannot be edited', () => {
  it('lists them as disabled options with the reason and never selects one', async () => {
    const u = user();
    await renderScreen(MIXED);

    // 'Aaa Broken' sorts first, but the first table that can be edited is open.
    expect(screen.getByRole('grid').getAttribute('aria-label')).toBe('Alpha (Store Sync)');
    await u.click(pickerButton());

    const blocked = option('Aaa Broken');
    expect(blocked.getAttribute('aria-disabled')).toBe('true');
    expect(blocked.getAttribute('title')).toBe(BROKEN);
    expect(within(blocked).getByText(BROKEN)).toBeTruthy();
    expect(option('Runtime Only').getAttribute('title')).toBe(RUNTIME);
    expect(option('Alpha').getAttribute('aria-disabled')).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(7);

    await u.click(blocked);
    expect(screen.getByRole('grid').getAttribute('aria-label')).toBe('Alpha (Store Sync)');
    expect(screen.queryByRole('grid', { name: /Broken/ })).toBeNull();
  });

  it('describes them as unavailable for the picker search, by process', async () => {
    const u = user();
    await renderScreen(MIXED);
    await u.click(pickerButton());
    await u.type(screen.getByRole('textbox', { name: 'Search tables' }), 'Store Sync | Unavailable');

    expect(screen.getAllByRole('option').map((o) => o.getAttribute('aria-disabled'))).toEqual([
      'true',
      'true',
      'true',
    ]);
  });

  it('never dirties or guards on a table that cannot be edited', async () => {
    await renderScreen(MIXED);
    clickCancel();

    expect(confirm).not.toHaveBeenCalled();
    expect(ctx.renderComponent).toHaveBeenCalledWith(LEFT);
  });

  it('does not list them at all when the config says hidden', async () => {
    const u = user();
    ctx.boomiConfig = config({ unavailableTables: 'hidden' });
    await renderScreen(MIXED);
    await u.click(pickerButton());

    const names = screen
      .getAllByRole('option')
      .map((o) => o.querySelector('.boomi-crt-tp-name-row')?.textContent);
    expect(names).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma']);
    expect(screen.queryByText('Aaa Broken')).toBeNull();
  });

  it.each([['disabled'], ['bogus'], [undefined]])(
    'lists them as disabled for the config value %s',
    async (value) => {
      const u = user();
      ctx.boomiConfig = config({ unavailableTables: value });
      await renderScreen(MIXED);
      await u.click(pickerButton());

      expect(screen.getAllByRole('option')).toHaveLength(7);
      expect(option('Zeta Broken').getAttribute('aria-disabled')).toBe('true');
    }
  );

  it('does not count a hidden table in "Shared with"', async () => {
    ctx.boomiConfig = config({ unavailableTables: 'hidden' });
    const other = table('Alpha', { processId: 'p2', processName: 'Order Import' });
    const otherBroken = { ...broken('Alpha', BROKEN), processId: 'p3', processName: 'Ghost Process', id: other.id };
    await renderScreen([table('Alpha'), other, otherBroken]);

    // Process names sort Order Import before Store Sync, so that copy is the one open.
    expect(screen.getByRole('grid').getAttribute('aria-label')).toBe('Alpha (Order Import)');
    expect(screen.getByText('Shared with: Store Sync')).toBeTruthy();
    expect(screen.queryByText(/Ghost Process/)).toBeNull();
  });
});

describe('empty states', () => {
  const expectEmptyScreen = () => {
    expect(screen.getByText('No editable cross reference tables')).toBeTruthy();
    expect(screen.queryByText('No cross reference tables to show.')).toBeNull();
    // The normal screen stays around it: title, description, Cancel; and no Save.
    expect(screen.getByText('Cross Reference Tables')).toBeTruthy();
    expect(screen.getByText(/View the lookup tables of this integration/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('grid')).toBeNull();
  };

  it('says so when the pack has no tables, with nothing listed', async () => {
    await renderScreen([]);

    expectEmptyScreen();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('still leaves through Cancel without a dialog', async () => {
    await renderScreen([]);
    clickCancel();

    expect(confirm).not.toHaveBeenCalled();
    expect(ctx.renderComponent).toHaveBeenCalledWith(LEFT);
  });

  it('lists every table that cannot be edited, one line each, when they are shown', async () => {
    await renderScreen([
      broken('Zeta', RUNTIME),
      broken('Beta', BROKEN),
      { ...broken('Beta', BROKEN), processId: 'p2', processName: 'Order Import' },
    ]);

    expectEmptyScreen();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      `Beta (Order Import): ${BROKEN}`,
      `Beta (Store Sync): ${BROKEN}`,
      `Zeta (Store Sync): ${RUNTIME}`,
    ]);
  });

  it('says so without a list when every table that cannot be edited is hidden', async () => {
    ctx.boomiConfig = config({ unavailableTables: 'hidden' });
    await renderScreen([broken('Beta', BROKEN), broken('Zeta', RUNTIME)]);

    expectEmptyScreen();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByText(/Beta/)).toBeNull();
  });

  it('keeps the configured title and description, and hides them when told to', async () => {
    ctx.boomiConfig = config({ title: 'Lookup tables', description: 'Pick one.', showDescription: false });
    await renderScreen([]);

    expect(screen.getByText('Lookup tables')).toBeTruthy();
    expect(screen.queryByText('Pick one.')).toBeNull();
  });
});

describe('full screen caption', () => {
  it('shows the picker, the process, the state and the counts, without a second table name', async () => {
    await renderScreen([table('Alpha')]);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle full screen' }));

    const caption = document.querySelector('.boomi-crt-fs-caption') as HTMLElement;
    expect(caption).not.toBeNull();
    expect(caption.querySelector('.boomi-crt-fs-title')).toBeNull();
    expect(within(caption).getByRole('button', { name: 'Table: Alpha' })).toBeTruthy();
    expect(within(caption).getByText('Store Sync')).toBeTruthy();
    expect(within(caption).getByText('Default')).toBeTruthy();
    expect(within(caption).getByText('2 rows, 2 columns')).toBeTruthy();
  });
});
