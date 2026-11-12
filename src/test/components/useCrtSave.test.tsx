/**
 * @file useCrtSave.test.tsx
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The save hook of the cross reference table screen, driven directly over real stores and a stand-in
 * for the service: what a conflict allows (no retry with a stamp that is already stale, an overwrite that
 * sends the stamp of what is there now or none), the words of a shared reset, and a write that went
 * through but answered with nothing, with something odd, or while the screen could not take the result.
 * The screen's own tests (UpdateCrossReferencesSave) cover the same flows through the buttons.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const saveTable = vi.hoisted(() => vi.fn());
const resetTable = vi.hoisted(() => vi.fn());
const fetchTables = vi.hoisted(() => vi.fn());
const emit = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock('../../events.service', () => ({ emitEmbedKitEvent: emit }));
vi.mock('../../logger.service', () => ({
  default: { log: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: logError },
}));
vi.mock('../../service/crossReferenceTables.service', () => ({
  useCrossReferenceTablesService: () => ({
    fetchCrossReferenceTables: fetchTables,
    saveCrossReferenceTable: saveTable,
    resetCrossReferenceTable: resetTable,
    fetchCrossReferenceHistory: vi.fn(),
  }),
}));

import { useCrtSave } from '../../components/integration/crt/useCrtSave';
import { createCrtStore, type CrtStore } from '../../utils/crt/crtStore';
import type { CrtTableData } from '../../utils/crt/crtTypes';
import { HttpError } from '../../service/http';

const key = (t: Pick<CrtTableData, 'processId' | 'id'>) => `${t.processId}:${t.id}`;

const makeTable = (processId: string, over: Partial<CrtTableData> = {}): CrtTableData => ({
  id: 't1',
  name: 'Codes',
  processId,
  processName: processId === 'p1' ? 'Main' : 'Second',
  matchType: 'exact',
  columns: ['code', 'value'],
  defaultRows: [['a', '1']],
  overrideRows: [['x', '1']],
  stamp: `o1.${processId}`,
  ...over,
});

const problem = (status: number, code?: string, extra: Record<string, unknown> = {}) =>
  new HttpError('failed', status, code ? { code, error: 'failed', ...extra } : undefined);

const okAnswer = (processId: string, over: Record<string, unknown> = {}) => ({
  processId,
  tableId: 't1',
  overridden: true,
  rowCount: 1,
  stamp: `o2.${processId}`,
  ...over,
});

interface Setup {
  tables?: CrtTableData[];
  /** The pack is a single-install pack: its processes share one copy of every table. */
  singleInstall?: boolean;
  /** Makes the open table dirty: 'edit' changes a cell, 'reset' shows the defaults again. */
  change?: 'edit' | 'reset' | null;
}

function setup({ tables = [makeTable('p1'), makeTable('p2')], change = 'edit', singleInstall = false }: Setup = {}) {
  const stores = new Map<string, CrtStore>(tables.map((t) => [key(t), createCrtStore(t)]));
  const open = tables[0];
  const openStore = stores.get(key(open)) as CrtStore;
  if (change === 'edit') openStore.setCell(0, 0, 'EDITED');
  if (change === 'reset') openStore.reset();
  const commitTable = vi.fn<(k: string, next: CrtTableData) => void>();
  const onNotice = vi.fn();
  const onWritten = vi.fn();
  const hook = renderHook(() =>
    useCrtSave({
      componentKey: 'k',
      packInstanceId: 'ipi-1',
      packId: 'pack-1',
      packEnvironmentId: 'env-1',
      packName: 'Pack',
      singleInstall,
      tables,
      selectedTable: open,
      getStore: (k) => stores.get(k),
      commitTable,
      onNotice,
      onWritten,
    })
  );
  const api = () => hook.result.current;
  /** Opens the shared confirmation and confirms it for the given other processes. */
  const confirm = async (others: string[]) => {
    act(() => api().openScope());
    await act(async () => api().confirmScope(others));
  };
  return { stores, openStore, commitTable, onNotice, onWritten, hook, api, confirm };
}

beforeEach(() => {
  for (const m of [saveTable, resetTable, fetchTables, emit, logError]) m.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('a conflict in a shared save', () => {
  const conflict = () => problem(409, 'TABLE_CHANGED', { currentStamp: 'o9.theirs' });

  it('is not retryable, a throttle in the same save is, and only the throttle is sent again', async () => {
    const h = setup();
    saveTable.mockImplementation(async (a: { processId: string }) => {
      if (a.processId === 'p1') throw conflict();
      throw problem(503, 'THROTTLED');
    });
    await h.confirm(['p2']);

    const lines = h.api().scope?.progress ?? [];
    const line = (id: string) => lines.find((l) => l.processId === id);
    expect(h.api().scope?.stage).toBe('done');
    expect(line('p1')).toMatchObject({ state: 'failed', retryable: false });
    expect(line('p1')?.message).toMatch(/Close this window, reload the table and save again/);
    expect(line('p2')).toMatchObject({ state: 'failed' });
    expect(line('p2')?.retryable).not.toBe(false);
    expect(saveTable).toHaveBeenCalledTimes(2);

    saveTable.mockImplementation(async (a: { processId: string }) => okAnswer(a.processId));
    await act(async () => h.api().retryScope());
    expect(saveTable).toHaveBeenCalledTimes(3);
    expect(saveTable.mock.calls[2][0]).toMatchObject({ processId: 'p2', expectedStamp: 'o1.p2' });
    const after = h.api().scope?.progress ?? [];
    expect(after.find((l) => l.processId === 'p2')).toMatchObject({ state: 'saved' });
    // The conflict is still there, still not retryable, and the save is not reported as a success.
    expect(after.find((l) => l.processId === 'p1')).toMatchObject({ state: 'failed', retryable: false });
    expect(h.api().toast).toBeNull();

    // Nothing is left to retry.
    await act(async () => h.api().retryScope());
    expect(saveTable).toHaveBeenCalledTimes(3);
  });

  it('with only conflicts there is nothing to retry', async () => {
    const h = setup();
    saveTable.mockRejectedValue(conflict());
    await h.confirm(['p2']);
    const lines = h.api().scope?.progress ?? [];
    expect(lines.map((l) => [l.state, l.retryable])).toEqual([
      ['failed', false],
      ['failed', false],
    ]);
    await act(async () => h.api().retryScope());
    expect(saveTable).toHaveBeenCalledTimes(2);
    expect(h.api().scope?.stage).toBe('done');
  });

  it('a failure that is not a conflict stays retryable, and a retry that works says everything was saved', async () => {
    const h = setup();
    saveTable.mockImplementation(async (a: { processId: string }) => {
      if (a.processId === 'p2') throw problem(502, 'BOOMI_REJECTED');
      return okAnswer(a.processId);
    });
    await h.confirm(['p2']);
    expect(h.api().toast).toBeNull();
    saveTable.mockImplementation(async (a: { processId: string }) => okAnswer(a.processId));
    await act(async () => h.api().retryScope());
    expect(h.api().toast?.content).toBe('Table saved in 2 processes.');
  });

  it('a timeout is reported with its own sentence and can be tried again', async () => {
    const h = setup();
    saveTable.mockImplementation(async (a: { processId: string }) => {
      if (a.processId === 'p2') throw problem(503);
      return okAnswer(a.processId);
    });
    await h.confirm(['p2']);
    const failed = h.api().scope?.progress.find((l) => l.processId === 'p2');
    expect(failed?.message).toBe('The server did not answer in time. The save may have gone through. Reload the table to check.');
    expect(failed?.retryable).not.toBe(false);
  });
});

describe('overwriting after a conflict', () => {
  it('sends the stamp of what is there now when the server said it', async () => {
    const h = setup({ tables: [makeTable('p1')] });
    saveTable.mockRejectedValueOnce(problem(409, 'TABLE_CHANGED', { currentStamp: 'o9.theirs' }));
    await act(async () => h.api().save());
    expect(h.api().conflict).toBe(true);
    saveTable.mockResolvedValue(okAnswer('p1'));
    await act(async () => h.api().overwriteConflict());
    expect(saveTable).toHaveBeenCalledTimes(2);
    expect(saveTable.mock.calls[0][0].expectedStamp).toBe('o1.p1');
    expect(saveTable.mock.calls[1][0].expectedStamp).toBe('o9.theirs');
  });

  it('sends no stamp at all when the server did not say, because the loaded one is stale', async () => {
    const h = setup({ tables: [makeTable('p1')] });
    saveTable.mockRejectedValueOnce(problem(409, 'TABLE_CHANGED'));
    await act(async () => h.api().save());
    expect(h.api().conflict).toBe(true);
    saveTable.mockResolvedValue(okAnswer('p1'));
    await act(async () => h.api().overwriteConflict());
    expect(saveTable).toHaveBeenCalledTimes(2);
    expect('expectedStamp' in saveTable.mock.calls[1][0]).toBe(false);
    expect(saveTable.mock.calls[1][0].rows).toEqual([['EDITED', '1']]);
    expect(h.api().toast?.content).toBe('Table saved.');
  });

  it('does the same for a reset', async () => {
    const h = setup({ tables: [makeTable('p1')], change: 'reset' });
    resetTable.mockRejectedValueOnce(problem(409, 'TABLE_CHANGED'));
    await act(async () => h.api().save());
    resetTable.mockResolvedValue(okAnswer('p1', { overridden: false, rowCount: 0 }));
    await act(async () => h.api().overwriteConflict());
    expect('expectedStamp' in resetTable.mock.calls[1][0]).toBe(false);
    expect(h.api().toast?.content).toBe('Default values restored.');
  });
});

describe('the words of a save and of a reset', () => {
  it('a shared reset says it is restoring defaults while it runs, and what it did when it is over', async () => {
    const h = setup({ change: 'reset' });
    let finish!: (v: unknown) => void;
    resetTable.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    resetTable.mockImplementation(async (a: { processId: string }) => okAnswer(a.processId, { overridden: false, rowCount: 0 }));
    act(() => h.api().openScope());
    expect(h.api().scope?.mode).toBe('reset');
    act(() => h.api().confirmScope(['p2']));
    expect(h.api().saving).toBe(true);
    expect(h.api().busyLabel).toBe('Restoring defaults...');
    await act(async () => finish(okAnswer('p1', { overridden: false, rowCount: 0 })));
    await waitFor(() => expect(h.api().saving).toBe(false));
    expect(resetTable).toHaveBeenCalledTimes(2);
    expect(saveTable).not.toHaveBeenCalled();
    expect(h.api().toast?.content).toBe('Default values restored in 2 processes.');
  });

  it('a shared reset to one process, and a shared save to one or to several', async () => {
    const reset = setup({ change: 'reset' });
    resetTable.mockImplementation(async (a: { processId: string }) => okAnswer(a.processId, { overridden: false }));
    await reset.confirm([]);
    expect(reset.api().toast?.content).toBe('Default values restored.');

    const one = setup();
    saveTable.mockImplementation(async (a: { processId: string }) => okAnswer(a.processId));
    await one.confirm([]);
    expect(one.api().toast?.content).toBe('Table saved.');

    const two = setup();
    await two.confirm(['p2']);
    expect(two.api().toast?.content).toBe('Table saved in 2 processes.');
  });

  it('a shared save says Saving... while it runs', async () => {
    const h = setup();
    let finish!: (v: unknown) => void;
    saveTable.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    act(() => h.api().openScope());
    act(() => h.api().confirmScope([]));
    expect(h.api().busyLabel).toBe('Saving...');
    await act(async () => finish(okAnswer('p1')));
  });

  it('the single process path keeps its own words', async () => {
    const save = setup({ tables: [makeTable('p1')] });
    saveTable.mockResolvedValue(okAnswer('p1'));
    await act(async () => save.api().save());
    expect(save.api().toast?.content).toBe('Table saved.');

    const reset = setup({ tables: [makeTable('p1')], change: 'reset' });
    let finish!: (v: unknown) => void;
    resetTable.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    act(() => reset.api().save());
    expect(reset.api().busyLabel).toBe('Restoring defaults...');
    await act(async () => finish(okAnswer('p1', { overridden: false })));
    expect(reset.api().toast?.content).toBe('Default values restored.');
  });
});

describe('a single-install pack, where the processes share one copy of a table', () => {
  it('offers no copy to the other processes, a multi-install pack with the same tables does', () => {
    expect(setup({ singleInstall: true }).api().shared).toBe(false);
    expect(setup({ singleInstall: false }).api().shared).toBe(true);
  });

  it('after a save the other process shows the saved rows and the new stamp, and nothing is sent for it', async () => {
    const h = setup({ singleInstall: true });
    saveTable.mockResolvedValue(okAnswer('p1', { stamp: 'o2.shared' }));
    await act(async () => h.api().save());

    expect(saveTable).toHaveBeenCalledTimes(1);
    expect(h.commitTable).toHaveBeenCalledTimes(2);
    const [openKey, openData] = h.commitTable.mock.calls[0];
    expect(openKey).toBe('p1:t1');
    expect(openData).toMatchObject({ processId: 'p1', overrideRows: [['EDITED', '1']], stamp: 'o2.shared' });
    const [otherKey, otherData] = h.commitTable.mock.calls[1];
    expect(otherKey).toBe('p2:t1');
    expect(otherData).toMatchObject({ processId: 'p2', processName: 'Second', overrideRows: [['EDITED', '1']], stamp: 'o2.shared' });
  });

  it('after a reset the other process is on the defaults too', async () => {
    const h = setup({ singleInstall: true, change: 'reset' });
    resetTable.mockResolvedValue(okAnswer('p1', { overridden: false, stamp: 'd0.shared' }));
    await act(async () => h.api().save());

    expect(resetTable).toHaveBeenCalledTimes(1);
    expect(h.commitTable).toHaveBeenCalledWith('p2:t1', expect.objectContaining({ processId: 'p2', overrideRows: null, stamp: 'd0.shared' }));
  });

  it('leaves a process that has unsaved edits alone, so its owner is asked as usual when saving', async () => {
    const h = setup({ singleInstall: true });
    h.stores.get('p2:t1')?.setCell(0, 1, 'MINE');
    saveTable.mockResolvedValue(okAnswer('p1'));
    await act(async () => h.api().save());

    expect(h.commitTable).toHaveBeenCalledTimes(1);
    expect(h.commitTable.mock.calls[0][0]).toBe('p1:t1');
  });

  it('leaves a process whose table cannot be edited alone, and tables of other ids', async () => {
    const tables = [makeTable('p1'), makeTable('p2', { unavailableReason: 'Could not read it' }), makeTable('p3', { id: 't2' })];
    const h = setup({ singleInstall: true, tables });
    saveTable.mockResolvedValue(okAnswer('p1'));
    await act(async () => h.api().save());

    expect(h.commitTable).toHaveBeenCalledTimes(1);
  });

  it('a failed save changes nothing anywhere', async () => {
    const h = setup({ singleInstall: true });
    saveTable.mockRejectedValue(problem(503, 'THROTTLED'));
    await act(async () => h.api().save());

    expect(h.commitTable).not.toHaveBeenCalled();
  });

  it('a multi-install pack never touches the other process after a save', async () => {
    const h = setup({ singleInstall: false });
    saveTable.mockResolvedValue(okAnswer('p1'));
    await act(async () => h.api().save());

    expect(h.commitTable).toHaveBeenCalledTimes(1);
    expect(h.commitTable.mock.calls[0][0]).toBe('p1:t1');
  });
});

describe('a write that went through', () => {
  it.each([
    ['an empty object', {}],
    ['null', null],
    ['nothing', undefined],
    ['text', 'ok'],
    ['an answer of the wrong types', { overridden: 'yes', rowCount: '1', stamp: 7 }],
  ])('is a success when the answer is %s, and the next save sends no stamp', async (_name, answer) => {
    const h = setup({ tables: [makeTable('p1')] });
    saveTable.mockResolvedValue(answer);
    await act(async () => h.api().save());
    expect(h.api().error).toBeNull();
    expect(h.api().conflict).toBe(false);
    expect(h.api().toast?.content).toBe('Table saved.');
    expect(h.api().saving).toBe(false);
    expect(h.commitTable).toHaveBeenCalledTimes(1);
    const [committedKey, next] = h.commitTable.mock.calls[0];
    expect(committedKey).toBe('p1:t1');
    // A save leaves rows of its own, whatever the answer said; no stamp is carried into the next save.
    expect(next.overrideRows).toEqual([['EDITED', '1']]);
    expect(next.stamp).toBeUndefined();
    // The event reports the rows that were sent.
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][2]).toMatchObject({ rowCount: 1 });
    expect(h.onWritten).toHaveBeenCalledTimes(1);
  });

  it('a reset with an empty answer leaves the process on the defaults', async () => {
    const h = setup({ tables: [makeTable('p1')], change: 'reset' });
    resetTable.mockResolvedValue({});
    await act(async () => h.api().save());
    expect(h.api().error).toBeNull();
    expect(h.api().toast?.content).toBe('Default values restored.');
    expect(h.commitTable.mock.calls[0][1]).toMatchObject({ overrideRows: null, stamp: undefined });
    expect(emit.mock.calls[0][0]).toBe('crossReference.table.reset');
  });

  it('a shared save whose answers are empty marks every process saved', async () => {
    const h = setup();
    saveTable.mockResolvedValue(null);
    await h.confirm(['p2']);
    expect(h.api().scope?.progress.map((l) => l.state)).toEqual(['saved', 'saved']);
    expect(h.api().toast?.content).toBe('Table saved in 2 processes.');
    expect(h.commitTable).toHaveBeenCalledTimes(2);
  });

  it('a screen that cannot take the saved table is logged without cell values, and the save still counts', async () => {
    const h = setup({ tables: [makeTable('p1')] });
    h.commitTable.mockImplementation(() => {
      throw new Error('boom');
    });
    saveTable.mockResolvedValue(okAnswer('p1'));
    await act(async () => h.api().save());
    expect(h.api().error).toBeNull();
    expect(h.api().conflict).toBe(false);
    expect(h.api().toast?.content).toBe('Table saved.');
    expect(h.api().saving).toBe(false);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logError.mock.calls)).not.toContain('EDITED');
    expect(JSON.stringify(logError.mock.calls)).toContain('t1');
    // The host is still told, and the history is still asked to reload.
    expect(emit).toHaveBeenCalledTimes(1);
    expect(h.onWritten).toHaveBeenCalledTimes(1);
  });

  it('in a shared save a screen that cannot take one table does not fail that process', async () => {
    const h = setup();
    h.commitTable.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    saveTable.mockImplementation(async (a: { processId: string }) => okAnswer(a.processId));
    await h.confirm(['p2']);
    expect(h.api().scope?.progress.map((l) => l.state)).toEqual(['saved', 'saved']);
    expect(h.api().toast?.content).toBe('Table saved in 2 processes.');
  });

  it('a callback that throws never changes the result', async () => {
    const h = setup({ tables: [makeTable('p1')] });
    h.onWritten.mockImplementation(() => {
      throw new Error('host callback');
    });
    saveTable.mockResolvedValue(okAnswer('p1'));
    await act(async () => h.api().save());
    expect(h.api().error).toBeNull();
    expect(h.api().toast?.content).toBe('Table saved.');
  });

  it('a request that fails is still a failure: nothing is committed, announced or reported', async () => {
    const h = setup({ tables: [makeTable('p1')] });
    saveTable.mockRejectedValue(problem(502, 'BOOMI_REJECTED'));
    await act(async () => h.api().save());
    expect(h.api().error).toMatch(/did not accept the save/);
    expect(h.api().toast).toBeNull();
    expect(h.commitTable).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(h.onWritten).not.toHaveBeenCalled();
  });

  it('after the screen is gone the host is told, and nothing else is touched', async () => {
    const h = setup({ tables: [makeTable('p1')] });
    let finish!: (v: unknown) => void;
    saveTable.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    act(() => h.api().save());
    h.hook.unmount();
    await act(async () => finish(okAnswer('p1')));
    expect(emit).toHaveBeenCalledTimes(1);
    expect(h.commitTable).not.toHaveBeenCalled();
    expect(h.onWritten).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('after the screen is gone a reload of the other version does not touch it either', async () => {
    const h = setup({ tables: [makeTable('p1')] });
    saveTable.mockRejectedValueOnce(problem(409, 'TABLE_CHANGED', { currentStamp: 'o9.theirs' }));
    await act(async () => h.api().save());
    expect(h.api().conflict).toBe(true);
    let answer!: (v: unknown) => void;
    fetchTables.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    act(() => h.api().reloadConflict());
    h.hook.unmount();
    await act(async () =>
      answer({
        tables: [
          {
            id: 't1',
            name: 'Codes',
            processId: 'p1',
            processName: 'Pack - Main',
            overridden: true,
            matchType: 'exact',
            columns: ['code', 'value'],
            defaultRows: [['a', '1']],
            overrideRows: [['theirs', '9']],
            stamp: 'o9.theirs',
          },
        ],
      })
    );
    expect(h.commitTable).not.toHaveBeenCalled();
    expect(h.onNotice).not.toHaveBeenCalled();
  });

  it('after the screen is gone a shared save does not touch it either', async () => {
    const h = setup();
    let finish!: (v: unknown) => void;
    saveTable.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    saveTable.mockImplementation(async (a: { processId: string }) => okAnswer(a.processId));
    act(() => h.api().openScope());
    act(() => h.api().confirmScope(['p2']));
    h.hook.unmount();
    await act(async () => finish(okAnswer('p1')));
    await act(async () => undefined);
    expect(h.commitTable).not.toHaveBeenCalled();
    expect(h.onWritten).not.toHaveBeenCalled();
  });
});
