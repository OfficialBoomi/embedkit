/**
 * @file ConfigureIntegrationCrossReferences.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The cross reference tables step of the Edit wizard: when the step is there (the feature is on and
 * `wizardStep` is not false, even for a pack with no tables), its label and its place between Map Fields and
 * Set Schedule / Run, Next, Back, Cancel and the breadcrumb (no dialog when nothing is unsaved, the standard
 * dialog otherwise, Keep editing stays and Discard and continue goes on), nothing loaded before the step is
 * first shown or loaded again when it is shown again, and a save in progress blocking the way out. The other
 * steps are small stand-ins; the Wizard and the cross reference screen are the real ones, with the same grid
 * and toolbar stand-ins as the other screen tests (the stand-in grid has one button that edits the first cell
 * of the open table).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { forwardRef, useImperativeHandle } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ctx = vi.hoisted(() => ({
  boomiConfig: {} as Record<string, unknown>,
  renderComponent: vi.fn(),
  setPageIsLoading: vi.fn(),
}));
const confirm = vi.hoisted(() => vi.fn());
const fetchTables = vi.hoisted(() => vi.fn());
const saveTable = vi.hoisted(() => vi.fn());
const resetTable = vi.hoisted(() => vi.fn());
const fetchHistory = vi.hoisted(() => vi.fn());
const fetchExtensions = vi.hoisted(() => vi.fn());
const getMaps = vi.hoisted(() => vi.fn());
const submits = vi.hoisted(() => ({ connections: vi.fn(), schedule: vi.fn() }));
const toasts = vi.hoisted(() => ({ shown: [] as string[] }));

vi.mock('../../context/pluginContext', () => ({ usePlugin: () => ctx }));
vi.mock('../../hooks/useDialogs', () => ({ useDialogs: () => ({ confirm, alert: vi.fn() }) }));
vi.mock('../../events.service', () => ({ emitEmbedKitEvent: vi.fn() }));
vi.mock('../../hooks/execution-request/useRunAllProcesses', () => ({
  useRunAllProcesses: () => ({ error: null, runAllProcesses: vi.fn() }),
}));
vi.mock('../../service/environmentExtensions.service', () => ({
  useEnvironmentExtensionsService: () => ({ fetchEnvironmentExtensions: fetchExtensions }),
}));
vi.mock('../../service/mapExtensions.service', () => ({
  useMapExtensionsService: () => ({ getMapExtensions: getMaps }),
}));
vi.mock('../../utils/browseSessionStore', () => ({
  BrowseSessionStore: { attachSessionsAndPrune: (maps: unknown[]) => maps },
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
  default: ({
    bodyContent,
    callbackOne,
    componentName,
  }: {
    bodyContent: React.ReactNode;
    callbackOne?: () => void;
    componentName?: string;
  }) => (
    <div data-testid="page-frame" data-name={componentName}>
      <button type="button" onClick={callbackOne}>
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
// The three older steps: each shows a marker only while it is the active step.
vi.mock('../../components/integration/UpdateConnections', () => ({
  default: forwardRef(({ active }: { active: boolean }, ref) => {
    useImperativeHandle(ref, () => ({ submit: submits.connections }), []);
    return active ? <div data-testid="step-connections">connections step</div> : null;
  }),
}));
vi.mock('../../components/integration/UpdateMaps', () => ({
  default: ({ active }: { active: boolean }) => (active ? <div data-testid="step-maps">maps step</div> : null),
}));
vi.mock('../../components/integration/UpdateSchedules', () => ({
  default: forwardRef(({ active }: { active: boolean }, ref) => {
    useImperativeHandle(ref, () => ({ submit: submits.schedule }), []);
    return active ? <div data-testid="step-schedule">schedule step</div> : null;
  }),
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

import ConfigureIntegration from '../../components/integration/ConfigureIntegration';
import { registerCrtDataSource } from '../../utils/crt/crtDataSource';

const integration = {
  id: 'ipi-1',
  environmentId: 'env-1',
  integrationPackId: 'pack-1',
  integrationPackName: 'Pack',
  installationType: 'MULTI',
} as never;

const serverTable = (name: string) => ({
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
});

const LABELS = ['Make Connections', 'Map Fields', 'Cross Reference Tables', 'Set Schedule / Run'];
const WITHOUT_CRT = ['Make Connections', 'Map Fields', 'Set Schedule / Run'];

const LEAVE_STEP = {
  title: 'You have unsaved changes',
  description: 'One table has unsaved changes. Discard and continue throws them away.',
  confirmLabel: 'Discard and continue',
  cancelLabel: 'Keep editing',
  destructive: true,
};

const crt = (extra: Record<string, unknown> = { enabled: true }) => {
  ctx.boomiConfig = { components: { k: { crossReferenceTables: extra } } };
};

/** The wizard with the steps the pack has. */
async function mountWizard({ connections = true, maps = true } = {}) {
  fetchExtensions.mockResolvedValue({ combined: connections ? [{ connections: { connection: [{}] } }] : [] });
  getMaps.mockResolvedValue(maps ? [{}] : []);
  const onBack = vi.fn();
  const utils = render(<ConfigureIntegration componentKey="k" integration={integration} onBack={onBack} />);
  await waitFor(() => expect(document.querySelector('.boomi-wizard')).not.toBeNull());
  return { onBack, ...utils };
}

const labels = () => [...document.querySelectorAll('.boomi-step-label')].map((el) => el.textContent);
const activeLabel = () => document.querySelector('.boomi-step--active .boomi-step-label')?.textContent;
const onPage = () => within(document.querySelector('.step-content.block') as HTMLElement);
const clickNext = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(onPage().getByRole('button', { name: /^(Next|Save and Close)$/ }));
const clickBack = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(onPage().getByRole('button', { name: /^(Back|Cancel)$/ }));
const clickBreadcrumb = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'My Integrations' }));
const edit = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'edit first cell' }));
const saveButton = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
const settle = () => act(async () => {});

/** From the first step to the cross reference step of a pack with connections and maps. */
async function goToCrt(user: ReturnType<typeof userEvent.setup>) {
  await clickNext(user);
  await waitFor(() => expect(activeLabel()).toBe('Map Fields'));
  await clickNext(user);
  await screen.findByRole('grid');
  expect(activeLabel()).toBe('Cross Reference Tables');
}

beforeEach(() => {
  ctx.boomiConfig = {};
  ctx.renderComponent.mockReset();
  for (const m of [confirm, fetchTables, saveTable, resetTable, fetchHistory, fetchExtensions, getMaps]) m.mockReset();
  submits.connections.mockReset().mockResolvedValue(true);
  submits.schedule.mockReset().mockResolvedValue(true);
  confirm.mockResolvedValue(false);
  fetchHistory.mockResolvedValue({ environment: null, tables: [] });
  fetchTables.mockResolvedValue({ tables: [serverTable('Alpha')] });
  toasts.shown.length = 0;
});
afterEach(() => {
  registerCrtDataSource(null);
});

describe('whether the step is there', () => {
  it('is a step of its own, between Map Fields and Set Schedule / Run, when the feature is on', async () => {
    crt();
    await mountWizard();
    expect(labels()).toEqual(LABELS);
  });

  it('is there when wizardStep is true as well', async () => {
    crt({ enabled: true, wizardStep: true });
    await mountWizard();
    expect(labels()).toEqual(LABELS);
  });

  it('uses the component title for its label', async () => {
    crt({ enabled: true, title: 'Lookup Tables' });
    await mountWizard();
    expect(labels()).toEqual(['Make Connections', 'Map Fields', 'Lookup Tables', 'Set Schedule / Run']);
  });

  it('is not there when the feature is off or not set, and nothing is ever loaded', async () => {
    const user = userEvent.setup();
    for (const config of [undefined, { enabled: false }, { wizardStep: true }]) {
      if (config) crt(config);
      else ctx.boomiConfig = {};
      const { unmount } = await mountWizard();
      expect(labels()).toEqual(WITHOUT_CRT);
      await clickNext(user);
      await waitFor(() => expect(activeLabel()).toBe('Map Fields'));
      await clickNext(user);
      await waitFor(() => expect(activeLabel()).toBe('Set Schedule / Run'));
      unmount();
    }
    expect(fetchTables).not.toHaveBeenCalled();
    expect(fetchHistory).not.toHaveBeenCalled();
  });

  it('is not there when wizardStep is false, though the feature is on', async () => {
    crt({ enabled: true, wizardStep: false });
    await mountWizard();
    expect(labels()).toEqual(WITHOUT_CRT);
    expect(fetchTables).not.toHaveBeenCalled();
  });

  it('is still there for a pack with no tables, and says so', async () => {
    const user = userEvent.setup();
    crt();
    fetchTables.mockResolvedValue({ tables: [] });
    await mountWizard();
    expect(labels()).toEqual(LABELS);
    await clickNext(user);
    await waitFor(() => expect(activeLabel()).toBe('Map Fields'));
    await clickNext(user);
    await screen.findByText('No editable cross reference tables');
    expect(activeLabel()).toBe('Cross Reference Tables');
    await clickNext(user);
    await waitFor(() => expect(activeLabel()).toBe('Set Schedule / Run'));
  });

  it('is the first step, loading at once, for a pack with no connections and no maps', async () => {
    crt();
    await mountWizard({ connections: false, maps: false });
    expect(labels()).toEqual(['Cross Reference Tables', 'Set Schedule / Run']);
    await screen.findByRole('grid');
    expect(fetchTables).toHaveBeenCalledTimes(1);
  });

  it('shows the body of the screen only: no page frame of its own and no Cancel button on the screen', async () => {
    const user = userEvent.setup();
    crt();
    await mountWizard();
    await goToCrt(user);
    expect(screen.getAllByTestId('page-frame')).toHaveLength(1);
    expect(screen.getByTestId('page-frame').getAttribute('data-name')).toBe('configureIntegration');
    expect(document.querySelector('.boomi-crt-savebar')?.textContent).not.toMatch(/Cancel/);
    expect(document.querySelector('.boomi-crt-screen')?.classList.contains('boomi-update-wizard')).toBe(true);
  });
});

describe('Next', () => {
  it('goes on with no dialog and no toast when nothing is unsaved', async () => {
    const user = userEvent.setup();
    crt();
    await mountWizard();
    await goToCrt(user);
    await clickNext(user);

    await screen.findByTestId('step-schedule');
    expect(activeLabel()).toBe('Set Schedule / Run');
    expect(confirm).not.toHaveBeenCalled();
    // Only the older steps toast; this one saves nothing and says nothing.
    expect(new Set(toasts.shown)).toEqual(new Set(['Connections updated successfully!', 'Mappings updated successfully!']));
    expect(saveTable).not.toHaveBeenCalled();
    expect(resetTable).not.toHaveBeenCalled();
  });

  it('asks first when a table has unsaved edits, and Keep editing stays on the step with the edits', async () => {
    const user = userEvent.setup();
    crt();
    await mountWizard();
    await goToCrt(user);
    await edit(user);
    await clickNext(user);

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledWith(LEAVE_STEP);
    await settle();
    expect(activeLabel()).toBe('Cross Reference Tables');
    expect(screen.queryByTestId('step-schedule')).toBeNull();
    expect(screen.getByText('1 row changed')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('grid')));
    expect(saveTable).not.toHaveBeenCalled();
  });

  it('goes on after Discard and continue, saving nothing', async () => {
    const user = userEvent.setup();
    crt();
    confirm.mockResolvedValue(true);
    await mountWizard();
    await goToCrt(user);
    await edit(user);
    await clickNext(user);

    await screen.findByTestId('step-schedule');
    expect(activeLabel()).toBe('Set Schedule / Run');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(saveTable).not.toHaveBeenCalled();
    expect(resetTable).not.toHaveBeenCalled();
  });

  it('does not pass while a save runs, and does pass once it is done', async () => {
    const user = userEvent.setup();
    crt();
    let finish!: (v: unknown) => void;
    saveTable.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await mountWizard();
    await goToCrt(user);
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Saving...');

    await clickNext(user);
    await settle();
    expect(activeLabel()).toBe('Cross Reference Tables');
    expect(screen.queryByTestId('step-schedule')).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    // Back and the breadcrumb are held in the same way.
    await clickBack(user);
    await clickBreadcrumb(user);
    await settle();
    expect(activeLabel()).toBe('Cross Reference Tables');

    await act(async () => finish({ processId: 'p1', tableId: 'id-alpha', overridden: true, rowCount: 2, stamp: 'o2.saved' }));
    await screen.findByText('Table saved.');
    await clickNext(user);
    await screen.findByTestId('step-schedule');
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('Back, Cancel and the breadcrumb', () => {
  it('Back goes to Map Fields with no dialog when nothing is unsaved', async () => {
    const user = userEvent.setup();
    crt();
    await mountWizard();
    await goToCrt(user);
    await clickBack(user);

    await screen.findByTestId('step-maps');
    expect(activeLabel()).toBe('Map Fields');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('Back asks first when a table has unsaved edits: Keep editing stays, Discard and continue goes back', async () => {
    const user = userEvent.setup();
    crt();
    await mountWizard();
    await goToCrt(user);
    await edit(user);
    await clickBack(user);

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledWith(LEAVE_STEP);
    await settle();
    expect(activeLabel()).toBe('Cross Reference Tables');
    expect(screen.queryByTestId('step-maps')).toBeNull();

    confirm.mockResolvedValue(true);
    await clickBack(user);
    await screen.findByTestId('step-maps');
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('Cancel on the first step asks the same, and leaves the wizard only after a yes', async () => {
    const user = userEvent.setup();
    crt();
    const { onBack } = await mountWizard({ connections: false, maps: false });
    await screen.findByRole('grid');
    await edit(user);
    await clickBack(user);

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledWith(LEAVE_STEP);
    await settle();
    expect(onBack).not.toHaveBeenCalled();

    confirm.mockResolvedValue(true);
    await clickBack(user);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it('Cancel on the first step leaves at once when nothing is unsaved', async () => {
    const user = userEvent.setup();
    crt();
    const { onBack } = await mountWizard({ connections: false, maps: false });
    await screen.findByRole('grid');
    await clickBack(user);

    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('the breadcrumb is guarded while this is the active step', async () => {
    const user = userEvent.setup();
    crt();
    const { onBack } = await mountWizard();
    await goToCrt(user);
    await clickBreadcrumb(user);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('the breadcrumb asks when a table has unsaved edits, and leaves only after Discard and continue', async () => {
    const user = userEvent.setup();
    crt();
    const { onBack } = await mountWizard();
    await goToCrt(user);
    await edit(user);
    await clickBreadcrumb(user);

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(confirm).toHaveBeenCalledWith(LEAVE_STEP);
    await settle();
    expect(onBack).not.toHaveBeenCalled();

    confirm.mockResolvedValue(true);
    await clickBreadcrumb(user);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it('the breadcrumb on any other step is the plain callback, with no dialog', async () => {
    const user = userEvent.setup();
    crt();
    const { onBack } = await mountWizard();
    await clickNext(user);
    await waitFor(() => expect(activeLabel()).toBe('Map Fields'));
    await clickBreadcrumb(user);

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('loading and keeping the step', () => {
  it('asks the server for nothing until the step is first shown, and not again when it is shown again', async () => {
    const user = userEvent.setup();
    crt();
    await mountWizard();
    await settle();
    expect(fetchTables).not.toHaveBeenCalled();
    expect(fetchHistory).not.toHaveBeenCalled();

    await clickNext(user);
    await waitFor(() => expect(activeLabel()).toBe('Map Fields'));
    expect(fetchTables).not.toHaveBeenCalled();

    await clickNext(user);
    await screen.findByRole('grid');
    expect(fetchTables).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1));

    await clickNext(user);
    await screen.findByTestId('step-schedule');
    await clickBack(user);
    expect(await screen.findByRole('grid')).toBeTruthy();
    expect(screen.queryByText('Loading cross reference tables...')).toBeNull();
    await settle();
    expect(fetchTables).toHaveBeenCalledTimes(1);
    expect(fetchHistory).toHaveBeenCalledTimes(1);
  });

  it('keeps the edits when the user keeps editing, and drops them when the user discards', async () => {
    const user = userEvent.setup();
    crt();
    await mountWizard();
    await goToCrt(user);
    await edit(user);

    // Keep editing: still the same edit after the dialog.
    await clickNext(user);
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    await settle();
    expect(screen.getByText('1 row changed')).toBeTruthy();

    // Discard and continue: the schedule step, and a clean table when the user comes back.
    confirm.mockResolvedValue(true);
    await clickNext(user);
    await screen.findByTestId('step-schedule');
    await clickBack(user);
    await screen.findByRole('grid');
    expect(screen.getByText('No changes to save')).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(fetchTables).toHaveBeenCalledTimes(1);
  });

  it('shows what was saved when the step comes back, without asking the server again', async () => {
    const user = userEvent.setup();
    crt();
    saveTable.mockResolvedValue({ processId: 'p1', tableId: 'id-alpha', overridden: true, rowCount: 2, stamp: 'o2.saved' });
    await mountWizard();
    await goToCrt(user);
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Table saved.');

    await clickNext(user);
    await screen.findByTestId('step-schedule');
    await clickBack(user);
    await screen.findByRole('grid');
    expect(screen.getByText('No changes to save')).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
    expect(fetchTables).toHaveBeenCalledTimes(1);
  });
});

describe('the other steps', () => {
  it('keep their own Next: connections submit and toast, maps toast, schedule submit and leave', async () => {
    const user = userEvent.setup();
    crt();
    await mountWizard();
    await clickNext(user);
    await waitFor(() => expect(activeLabel()).toBe('Map Fields'));
    expect(submits.connections).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Connections updated successfully!')).toBeTruthy();

    await clickNext(user);
    await screen.findByRole('grid');
    expect(screen.getByText('Mappings updated successfully!')).toBeTruthy();

    await clickNext(user);
    await screen.findByTestId('step-schedule');
    await clickNext(user);
    await waitFor(() => expect(ctx.renderComponent).toHaveBeenCalledWith({ component: 'Integrations', props: { componentKey: 'k' } }));
    expect(submits.schedule).toHaveBeenCalledTimes(1);
  });

  it('keep their Back with no dialog: Map Fields back to Make Connections, Cancel on the first step', async () => {
    const user = userEvent.setup();
    crt();
    const { onBack } = await mountWizard();
    await clickNext(user);
    await waitFor(() => expect(activeLabel()).toBe('Map Fields'));
    await clickBack(user);
    await screen.findByTestId('step-connections');
    await clickBack(user);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(confirm).not.toHaveBeenCalled();
  });
});
