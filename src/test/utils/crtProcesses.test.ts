/**
 * @file crtProcesses.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */
import { describe, it, expect } from 'vitest';
import { mergeProcesses, pickInitial, tableAfterProcessSwitch, tablesOfProcess } from '../../utils/crt/crtProcesses';
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
