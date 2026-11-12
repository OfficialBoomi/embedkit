/**
 * @file UpdateCrossReferencesWizard.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The cross reference table screen as a step of the Edit wizard: the body only (no page frame, no Cancel
 * button) while the standalone screen keeps both, nothing loaded until the step is first active and nothing
 * loaded again when it is shown again, edits and data kept while the step is hidden, and the ref handle the
 * wizard asks before it moves away (no dialog when nothing is unsaved, the standard dialog with its own
 * wording otherwise, Discard and continue dropping the edits, and no way out while a save runs). The grid
 * and the toolbar are small stand-ins, as in the other screen tests; the stand-in grid has one button that
 * edits the first cell of the open table.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef, forwardRef, useImperativeHandle } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const ctx = vi.hoisted(() => ({
  boomiConfig: {} as Record<string, unknown>,
  renderComponent: vi.fn(),
}));
const confirm = vi.hoisted(() => vi.fn());
const fetchTables = vi.hoisted(() => vi.fn());
const saveTable = vi.hoisted(() => vi.fn());
const resetTable = vi.hoisted(() => vi.fn());
const fetchHistory = vi.hoisted(() => vi.fn());

vi.mock('../../context/pluginContext', () => ({ usePlugin: () => ctx }));
vi.mock('../../hooks/useDialogs', () => ({ useDialogs: () => ({ confirm, alert: vi.fn() }) }));
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
  default: ({ bodyContent, callbackOne }: { bodyContent: React.ReactNode; callbackOne?: () => void }) => (
    <div data-testid="page-frame">
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

import UpdateCrossReferences, { type UpdateCrossReferencesRef } from '../../components/integration/UpdateCrossReferences';
import { registerCrtDataSource } from '../../utils/crt/crtDataSource';

const integration = { id: 'ipi-1', environmentId: 'env-1', integrationPackId: 'pack-1', integrationPackName: 'Pack' } as never;

/** A table that already has rows of its own, so one cell edit is the only change. */
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

const LEAVE_ONE = {
  title: 'You have unsaved changes',
  description: 'One table has unsaved changes. Discard and continue throws them away.',
  confirmLabel: 'Discard and continue',
  cancelLabel: 'Keep editing',
  destructive: true,
};

type Props = { active?: boolean; wizard?: boolean; onBack?: () => void };
const element = (props: Props, ref?: React.Ref<UpdateCrossReferencesRef>) => (
  <UpdateCrossReferences ref={ref} componentKey="k" integration={integration} {...props} />
);
const edit = async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'edit first cell' }));
const saveButton = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
const pickerButton = () => screen.getAllByRole('button', { name: /^Table\b/ })[0];
const settle = () => act(async () => {});

beforeEach(() => {
  ctx.boomiConfig = {};
  for (const m of [confirm, fetchTables, saveTable, resetTable, fetchHistory]) m.mockReset();
  confirm.mockResolvedValue(false);
  fetchHistory.mockResolvedValue({ environment: null, tables: [] });
  fetchTables.mockResolvedValue({ tables: [serverTable('Alpha')] });
});
afterEach(() => {
  registerCrtDataSource(null);
});

describe('wizard mode of the screen', () => {
  it('shows the body only: no page frame and no Cancel button, with the wizard marker class', async () => {
    render(element({ wizard: true, active: true, onBack: vi.fn() }));
    await screen.findByRole('grid');

    expect(screen.queryByTestId('page-frame')).toBeNull();
    expect(screen.queryByRole('button', { name: 'My Integrations' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    // The split Save button and the rest of the save bar are still there.
    expect(saveButton()).toBeTruthy();
    expect(screen.getByText('No changes to save')).toBeTruthy();
    const screenEl = document.querySelector('.boomi-crt-screen') as HTMLElement;
    expect(screenEl.classList.contains('boomi-update-wizard')).toBe(true);
    expect(screenEl.classList.contains('boomi-update')).toBe(false);
  });

  it('has no Cancel button in the empty state either, and still says there is nothing to edit', async () => {
    fetchTables.mockResolvedValue({ tables: [] });
    render(element({ wizard: true, active: true }));
    await screen.findByText('No editable cross reference tables');

    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.queryByTestId('page-frame')).toBeNull();
    expect(document.querySelector('.boomi-crt-screen')?.classList.contains('boomi-update-wizard')).toBe(true);
  });

  it('keeps the page frame, the Cancel button and the card class when it is not a wizard step', async () => {
    render(element({ onBack: vi.fn() }));
    await screen.findByRole('grid');

    expect(screen.getByTestId('page-frame')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'My Integrations' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    const screenEl = document.querySelector('.boomi-crt-screen') as HTMLElement;
    expect(screenEl.classList.contains('boomi-update')).toBe(true);
    expect(screenEl.classList.contains('boomi-update-wizard')).toBe(false);
  });

  it('keeps the Cancel button in the standalone empty state', async () => {
    fetchTables.mockResolvedValue({ tables: [] });
    render(element({}));
    await screen.findByText('No editable cross reference tables');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });
});

describe('loading and keeping the data', () => {
  it('asks the server for nothing until the step is first active, and renders nothing before that', async () => {
    const { container, rerender } = render(element({ wizard: true, active: false }));
    await settle();
    expect(fetchTables).not.toHaveBeenCalled();
    expect(fetchHistory).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('');

    rerender(element({ wizard: true, active: true }));
    await screen.findByRole('grid');
    expect(fetchTables).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1));
  });

  it('does not ask again when the step is shown again, and shows the same table at once', async () => {
    const { container, rerender } = render(element({ wizard: true, active: true }));
    await screen.findByRole('grid');
    await waitFor(() => expect(fetchHistory).toHaveBeenCalledTimes(1));

    rerender(element({ wizard: true, active: false }));
    expect(container.innerHTML).toBe('');
    rerender(element({ wizard: true, active: true }));
    // No loading state in between: the data was kept while the step was hidden.
    expect(screen.queryByText('Loading cross reference tables...')).toBeNull();
    expect(screen.getByRole('grid')).toBeTruthy();
    await settle();
    expect(fetchTables).toHaveBeenCalledTimes(1);
    expect(fetchHistory).toHaveBeenCalledTimes(1);
  });

  it('keeps unsaved edits and the open table while the step is hidden', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha'), serverTable('Beta')] });
    const { rerender } = render(element({ wizard: true, active: true }));
    await screen.findByRole('grid');
    await user.click(pickerButton());
    await user.click(screen.getAllByRole('option').find((o) => o.textContent?.includes('Beta')) as HTMLElement);
    await edit(user);
    expect(screen.getByText('1 row changed')).toBeTruthy();

    rerender(element({ wizard: true, active: false }));
    expect(screen.queryByRole('grid')).toBeNull();
    rerender(element({ wizard: true, active: true }));

    expect(screen.getByRole('grid').getAttribute('aria-label')).toBe('Beta (Main)');
    expect(screen.getByText('1 row changed')).toBeTruthy();
    expect(fetchTables).toHaveBeenCalledTimes(1);
  });

  it('still loads on mount when it is rendered as a wizard step without an active flag', async () => {
    render(element({ wizard: true }));
    await screen.findByRole('grid');
    expect(fetchTables).toHaveBeenCalledTimes(1);
  });
});

describe('the handle the wizard asks before it moves away', () => {
  const mount = async (props: Props = { wizard: true, active: true }) => {
    const ref = createRef<UpdateCrossReferencesRef>();
    const utils = render(element(props, ref));
    await screen.findByRole('grid');
    return { ref, ...utils };
  };
  const ask = async (ref: React.RefObject<UpdateCrossReferencesRef | null>): Promise<boolean> => {
    let answer: boolean | undefined;
    await act(async () => {
      answer = await ref.current!.confirmLeave();
    });
    return answer as boolean;
  };

  it('says whether any table has unsaved edits', async () => {
    const user = userEvent.setup();
    const { ref } = await mount();
    expect(ref.current!.hasUnsavedChanges()).toBe(false);
    await edit(user);
    expect(ref.current!.hasUnsavedChanges()).toBe(true);
  });

  it('lets the wizard go at once, with no dialog, when nothing is unsaved', async () => {
    const { ref } = await mount();
    expect(await ask(ref)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks with the wizard wording when a table has unsaved edits, and stays on a no', async () => {
    const user = userEvent.setup();
    const { ref } = await mount();
    await edit(user);

    expect(await ask(ref)).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(LEAVE_ONE);
    // Keep editing: the edits are still there, and the grid gets focus back.
    expect(ref.current!.hasUnsavedChanges()).toBe(true);
    expect(screen.getByText('1 row changed')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('grid')));
  });

  it('names how many tables have unsaved edits', async () => {
    const user = userEvent.setup();
    fetchTables.mockResolvedValue({ tables: [serverTable('Alpha'), serverTable('Beta')] });
    const { ref } = await mount();
    await edit(user);
    await user.click(pickerButton());
    await user.click(screen.getAllByRole('option').find((o) => o.textContent?.includes('Beta')) as HTMLElement);
    await edit(user);

    await ask(ref);
    expect(confirm.mock.calls[0][0].description).toBe('2 tables have unsaved changes. Discard and continue throws them away.');
  });

  it('drops the edits and says yes on Discard and continue, so they are gone when the step comes back', async () => {
    const user = userEvent.setup();
    confirm.mockResolvedValue(true);
    const { ref, rerender } = await mount();
    await edit(user);

    expect(await ask(ref)).toBe(true);
    expect(ref.current!.hasUnsavedChanges()).toBe(false);
    rerender(element({ wizard: true, active: false }, ref));
    rerender(element({ wizard: true, active: true }, ref));
    expect(screen.getByText('No changes to save')).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(fetchTables).toHaveBeenCalledTimes(1);
    // A second ask has nothing left to ask about.
    expect(await ask(ref)).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('opens one dialog only when asked twice at once, and the second answer is no', async () => {
    const user = userEvent.setup();
    let answer: (leave: boolean) => void = () => {};
    confirm.mockImplementation(() => new Promise<boolean>((resolve) => (answer = resolve)));
    const { ref } = await mount();
    await edit(user);

    let first: boolean | undefined;
    let second: boolean | undefined;
    await act(async () => {
      const a = ref.current!.confirmLeave().then((v) => (first = v));
      const b = ref.current!.confirmLeave().then((v) => (second = v));
      await b;
      expect(second).toBe(false);
      answer(true);
      await a;
    });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(first).toBe(true);
  });

  it('says no, and asks nothing, while a save runs; then yes once it is done', async () => {
    const user = userEvent.setup();
    let finish!: (v: unknown) => void;
    saveTable.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { ref } = await mount();
    await edit(user);
    await user.click(saveButton());
    await screen.findByText('Saving...');

    expect(await ask(ref)).toBe(false);
    expect(confirm).not.toHaveBeenCalled();

    await act(async () => finish({ processId: 'p1', tableId: 'id-alpha', overridden: true, rowCount: 2, stamp: 'o2.saved' }));
    await screen.findByText('Table saved.');
    expect(await ask(ref)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('says yes with nothing to ask while the tables have not loaded yet', async () => {
    const ref = createRef<UpdateCrossReferencesRef>();
    render(element({ wizard: true, active: false }, ref));
    expect(await ask(ref)).toBe(true);
    expect(ref.current!.hasUnsavedChanges()).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });
});
