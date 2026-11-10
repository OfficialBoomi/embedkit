/**
 * @file crtProcesses.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */
import { describe, it, expect } from 'vitest';
import {
  hasRequest,
  mergeProcesses,
  pickInitial,
  pickRequested,
  requestKey,
  tableAfterProcessSwitch,
  tablesOfProcess,
} from '../../utils/crt/crtProcesses';
import type { CrtTableData } from '../../utils/crt/crtTypes';

const t = (name: string, processId: string, extra: Partial<CrtTableData> = {}): CrtTableData => ({
  id: `id-${name.toLowerCase().replace(/\W+/g, '-')}`,
  name,
  processId,
  processName: processId.toUpperCase(),
  matchType: 'exact',
  columns: ['a', 'b'],
  defaultRows: [['1', '2']],
  overrideRows: null,
  ...extra,
});
const broken = (name: string, processId: string) => t(name, processId, { columns: [], defaultRows: [], unavailableReason: 'cannot be read' });

describe('tablesOfProcess', () => {
  it('keeps only that process, sorted by name with numbers by value', () => {
    const list = [t('T10', 'p1'), t('T2', 'p1'), t('T1', 'p2'), t('T1', 'p1')];
    expect(tablesOfProcess(list, 'p1').map((x) => x.name)).toEqual(['T1', 'T2', 'T10']);
  });
  it('does not change the list it is given', () => {
    const list = [t('B', 'p1'), t('A', 'p1')];
    tablesOfProcess(list, 'p1');
    expect(list.map((x) => x.name)).toEqual(['B', 'A']);
  });
});

describe('mergeProcesses', () => {
  it('lists named processes, also those with no table, sorted by name', () => {
    const merged = mergeProcesses(
      [
        { id: 'p3', name: 'Zeta' },
        { id: 'p1', name: 'Alpha 10' },
        { id: 'p2', name: 'Alpha 2' },
      ],
      [t('T1', 'p1')]
    );
    expect(merged.map((p) => p.id)).toEqual(['p2', 'p1', 'p3']);
  });
  it('adds a process that only a table names, and prefers the name the source gave', () => {
    const merged = mergeProcesses([{ id: 'p1', name: 'Named' }], [t('T1', 'p1'), t('T2', 'p9', { processName: 'From a table' })]);
    expect(merged).toEqual([
      { id: 'p9', name: 'From a table' },
      { id: 'p1', name: 'Named' },
    ].sort((a, b) => a.name.localeCompare(b.name)));
    expect(merged.find((p) => p.id === 'p1')?.name).toBe('Named');
  });
  it('lists a process once however many tables it has', () => {
    expect(mergeProcesses([], [t('A', 'p1'), t('B', 'p1')])).toHaveLength(1);
  });
  it('is empty for no processes and no tables', () => {
    expect(mergeProcesses([], [])).toEqual([]);
  });
});

describe('pickInitial', () => {
  const procs = [
    { id: 'p1', name: 'First' },
    { id: 'p2', name: 'Second' },
    { id: 'p3', name: 'Third' },
  ];
  it('opens the first editable table of the first process', () => {
    const picked = pickInitial(procs, [t('B', 'p1'), t('A', 'p1'), t('X', 'p2')]);
    expect(picked.process?.id).toBe('p1');
    expect(picked.table?.name).toBe('A');
  });
  it('skips a process with no table, and one whose tables cannot be edited', () => {
    const picked = pickInitial(procs, [broken('A', 'p1'), t('X', 'p3')]);
    expect(picked.process?.id).toBe('p3');
    expect(picked.table?.name).toBe('X');
  });
  it('skips an unavailable table inside a process that has an editable one', () => {
    expect(pickInitial(procs, [broken('A', 'p1'), t('B', 'p1')]).table?.name).toBe('B');
  });
  it('opens no table when none can be edited, and shows the first process that has tables', () => {
    const picked = pickInitial(procs, [broken('A', 'p2')]);
    expect(picked.table).toBeNull();
    expect(picked.process?.id).toBe('p2');
  });
  it('opens no table when no process has any, and shows the first process', () => {
    const picked = pickInitial(procs, []);
    expect(picked.table).toBeNull();
    expect(picked.process?.id).toBe('p1');
  });
  it('gives nothing for a pack with no process', () => {
    expect(pickInitial([], [])).toEqual({ process: null, table: null });
  });
});

describe('tableAfterProcessSwitch', () => {
  const tables = [t('Shared', 'p1'), t('Only1', 'p1'), t('Shared', 'p2'), t('Only2', 'p2'), t('Aaa', 'p2')];
  it('keeps the same table when the new process has it', () => {
    const shared = tables[0].id;
    expect(tableAfterProcessSwitch(tables, 'p2', shared)?.processId).toBe('p2');
    expect(tableAfterProcessSwitch(tables, 'p2', shared)?.id).toBe(shared);
  });
  it('otherwise opens the first editable table of the new process', () => {
    expect(tableAfterProcessSwitch(tables, 'p2', tables[1].id)?.name).toBe('Aaa');
  });
  it('does not keep a table that cannot be edited in the new process', () => {
    const list = [t('Shared', 'p1'), broken('Shared', 'p2'), t('Other', 'p2')];
    expect(tableAfterProcessSwitch(list, 'p2', list[0].id)?.name).toBe('Other');
  });
  it('opens nothing when the new process has no editable table', () => {
    expect(tableAfterProcessSwitch([t('A', 'p1'), broken('B', 'p2')], 'p2', null)).toBeNull();
    expect(tableAfterProcessSwitch([t('A', 'p1')], 'p9', null)).toBeNull();
  });
});

describe('pickRequested', () => {
  const procs = [
    { id: 'p1', name: 'First' },
    { id: 'p2', name: 'Second' },
    { id: 'p3', name: 'Third' },
  ];
  // Shared is in p1 and p2; Only3 is in p3 only; Alone is in p2 only.
  const tables = [t('Shared', 'p1'), t('Shared', 'p2'), t('Alone', 'p2'), t('Only3', 'p3')];
  const idOf = (name: string) => `id-${name.toLowerCase()}`;
  const where = (r: ReturnType<typeof pickRequested>) => [r.process?.id, r.table?.name, r.honored];

  it('with nothing asked for, gives exactly what pickInitial gives', () => {
    for (const request of [{}, { tableId: undefined, processId: undefined }, { tableId: '', processId: '' }]) {
      const picked = pickRequested(procs, tables, request);
      expect({ process: picked.process, table: picked.table }).toEqual(pickInitial(procs, tables));
      expect(picked.honored).toBe(true);
    }
  });

  it('opens the table in the requested process when that process has it', () => {
    expect(where(pickRequested(procs, tables, { tableId: idOf('Shared'), processId: 'p2' }))).toEqual(['p2', 'Shared', true]);
    expect(where(pickRequested(procs, tables, { tableId: idOf('Shared'), processId: 'p1' }))).toEqual(['p1', 'Shared', true]);
  });

  it('opens the table in the first process that has it when the requested process does not', () => {
    expect(where(pickRequested(procs, tables, { tableId: idOf('Only3'), processId: 'p1' }))).toEqual(['p3', 'Only3', true]);
    expect(where(pickRequested(procs, tables, { tableId: idOf('Shared'), processId: 'p3' }))).toEqual(['p1', 'Shared', true]);
  });

  it('opens the table in the first process that has it when no process is named, or an unknown one is', () => {
    expect(where(pickRequested(procs, tables, { tableId: idOf('Alone') }))).toEqual(['p2', 'Alone', true]);
    expect(where(pickRequested(procs, tables, { tableId: idOf('Shared') }))).toEqual(['p1', 'Shared', true]);
    expect(where(pickRequested(procs, tables, { tableId: idOf('Shared'), processId: 'nope' }))).toEqual(['p1', 'Shared', true]);
  });

  it('uses the order of the processes it is given, not the order of the tables', () => {
    const reversed = [procs[2], procs[1], procs[0]];
    expect(where(pickRequested(reversed, tables, { tableId: idOf('Shared') }))).toEqual(['p2', 'Shared', true]);
  });

  it('skips a copy of the table that cannot be edited, in the requested process too', () => {
    const list = [broken('Shared', 'p1'), t('Shared', 'p2')];
    expect(where(pickRequested(procs, list, { tableId: idOf('Shared'), processId: 'p1' }))).toEqual(['p2', 'Shared', true]);
    expect(where(pickRequested(procs, list, { tableId: idOf('Shared') }))).toEqual(['p2', 'Shared', true]);
  });

  it('opens the first editable table of a requested process when only a process is asked for', () => {
    const list = [t('B', 'p2'), t('A', 'p2'), broken('0', 'p2'), t('X', 'p1')];
    expect(where(pickRequested(procs, list, { processId: 'p2' }))).toEqual(['p2', 'A', true]);
  });

  it('falls back to the default selection, not honored, for a table nobody has', () => {
    const picked = pickRequested(procs, tables, { tableId: 'id-missing', processId: 'p2' });
    expect(picked.honored).toBe(false);
    expect({ process: picked.process, table: picked.table }).toEqual(pickInitial(procs, tables));
  });

  it('falls back, not honored, when every copy of the table is not editable', () => {
    const list = [broken('Dead', 'p1'), broken('Dead', 'p2'), t('Live', 'p3')];
    const picked = pickRequested(procs, list, { tableId: idOf('Dead'), processId: 'p1' });
    expect(picked.honored).toBe(false);
    expect(where(picked)).toEqual(['p3', 'Live', false]);
  });

  it('falls back, not honored, for a process that is unknown or has no editable table', () => {
    const list = [broken('A', 'p1'), t('B', 'p2')];
    expect(where(pickRequested(procs, list, { processId: 'p1' }))).toEqual(['p2', 'B', false]);
    expect(where(pickRequested(procs, list, { processId: 'nope' }))).toEqual(['p2', 'B', false]);
    expect(where(pickRequested(procs, list, { processId: 'p3' }))).toEqual(['p2', 'B', false]);
  });

  it('falls back to no table at all when nothing can be edited anywhere', () => {
    const picked = pickRequested(procs, [broken('A', 'p2')], { tableId: idOf('A') });
    expect(picked.table).toBeNull();
    expect(picked.process?.id).toBe('p2');
    expect(picked.honored).toBe(false);
  });

  it('gives nothing for a pack with no process', () => {
    expect(pickRequested([], [], { tableId: 'x' })).toEqual({ process: null, table: null, honored: false });
    expect(pickRequested([], [], {})).toEqual({ process: null, table: null, honored: true });
  });

  it('does not change what it is given', () => {
    const list = [t('B', 'p1'), t('A', 'p1')];
    pickRequested(procs, list, { processId: 'p1' });
    expect(list.map((x) => x.name)).toEqual(['B', 'A']);
  });
});

describe('hasRequest and requestKey', () => {
  it('see a request only when a table or a process is named', () => {
    expect(hasRequest({})).toBe(false);
    expect(hasRequest({ tableId: '', processId: '' })).toBe(false);
    expect(hasRequest({ tableId: 'a' })).toBe(true);
    expect(hasRequest({ processId: 'p' })).toBe(true);
  });

  it('give no key for no request, and a different key for a different request', () => {
    expect(requestKey({})).toBeNull();
    expect(requestKey({ tableId: '', processId: '' })).toBeNull();
    const keys = [
      requestKey({ tableId: 'a' }),
      requestKey({ processId: 'a' }),
      requestKey({ tableId: 'a', processId: 'b' }),
      requestKey({ tableId: 'b', processId: 'a' }),
    ];
    expect(new Set(keys).size).toBe(4);
    expect(requestKey({ tableId: 'a', processId: 'b' })).toBe(requestKey({ tableId: 'a', processId: 'b' }));
  });
});
