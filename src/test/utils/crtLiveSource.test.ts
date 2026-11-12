/**
 * @file crtLiveSource.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createLiveCrtDataSource,
  displayProcessName,
  mapServerLimits,
  mapServerProcesses,
  mapServerTable,
  mapServerTables,
  ROWS_MISSING_REASON,
  UNEXPECTED_ANSWER,
  type CrtServerTable,
} from '../../utils/crt/crtLiveSource';

const server = (over: Partial<CrtServerTable> = {}): CrtServerTable => ({
  id: 't1',
  name: 'T01 Basic',
  processId: 'p1',
  processName: 'Main',
  overridden: false,
  matchType: 'exact',
  columns: ['A', 'B'],
  defaultRows: [
    ['1', 'one'],
    ['2', 'two'],
  ],
  overrideRows: null,
  ...over,
});

describe('mapServerTable', () => {
  it('maps a table that is not overridden', () => {
    expect(mapServerTable(server())).toEqual({
      id: 't1',
      name: 'T01 Basic',
      processId: 'p1',
      processName: 'Main',
      matchType: 'exact',
      columns: ['A', 'B'],
      defaultRows: [
        ['1', 'one'],
        ['2', 'two'],
      ],
      overrideRows: null,
    });
  });

  it('keeps the match type, and treats an unknown or missing one as exact', () => {
    expect(mapServerTable(server({ matchType: 'wildcard' })).matchType).toBe('wildcard');
    expect(mapServerTable(server({ matchType: 'regex' })).matchType).toBe('regex');
    expect(mapServerTable(server({ matchType: 'fuzzy' as never })).matchType).toBe('exact');
    const without: Partial<CrtServerTable> = server();
    delete without.matchType;
    expect(mapServerTable(without as CrtServerTable).matchType).toBe('exact');
  });

  it('keeps the override rows of an overridden table', () => {
    const t = mapServerTable(server({ overridden: true, overrideRows: [['9', 'nine']] }));
    expect(t.overrideRows).toEqual([['9', 'nine']]);
  });

  it('keeps an override of an empty table as an empty list, not as "not overridden"', () => {
    expect(mapServerTable(server({ overridden: true, overrideRows: [] })).overrideRows).toEqual([]);
  });

  it('a table with no rows is still a table with its headers', () => {
    const t = mapServerTable(server({ defaultRows: [] }));
    expect(t.unavailableReason).toBeUndefined();
    expect(t.columns).toEqual(['A', 'B']);
    expect(t.defaultRows).toEqual([]);
  });

  it('passes the reason of a table that cannot be edited and drops its data', () => {
    const t = mapServerTable(server({ unavailableReason: 'Runtime specific', columns: [], defaultRows: undefined }));
    expect(t.unavailableReason).toBe('Runtime specific');
    expect(t.columns).toEqual([]);
    expect(t.defaultRows).toEqual([]);
    expect(t.overrideRows).toBeNull();
    expect(t.matchType).toBe('exact');
  });

  it('lists a table that should have rows but arrived without as unavailable, not as an empty table', () => {
    expect(mapServerTable(server({ defaultRows: undefined })).unavailableReason).toBe(ROWS_MISSING_REASON);
    expect(mapServerTable(server({ columns: [] })).unavailableReason).toBe(ROWS_MISSING_REASON);
    expect(mapServerTable(server({ overridden: true, overrideRows: undefined })).unavailableReason).toBe(ROWS_MISSING_REASON);
  });

  it('fits every row to the number of columns', () => {
    const t = mapServerTable(server({ defaultRows: [['only'], ['a', 'b', 'extra'], [] as string[]] }));
    expect(t.defaultRows).toEqual([['only', ''], ['a', 'b'], ['', '']]);
  });

  it('does not copy rows that already fit', () => {
    const rows = [['1', 'one']];
    expect(mapServerTable(server({ defaultRows: rows })).defaultRows[0]).toBe(rows[0]);
  });

  it('keeps text exactly as sent: spaces, numbers and blanks', () => {
    const t = mapServerTable(server({ defaultRows: [['007', ' padded '], ['', '1E5']] }));
    expect(t.defaultRows).toEqual([['007', ' padded '], ['', '1E5']]);
  });

  it('carries the stamp through, for a table with an override too', () => {
    expect(mapServerTable(server({ stamp: 'd0.abc' })).stamp).toBe('d0.abc');
    expect(mapServerTable(server({ overridden: true, overrideRows: [['9', 'nine']], stamp: 'o1.xyz' })).stamp).toBe('o1.xyz');
  });

  it('has no stamp key at all when the server sent none or sent something that is not text', () => {
    expect('stamp' in mapServerTable(server())).toBe(false);
    for (const bad of [7, null, {}, ['d0.abc'], true]) {
      expect('stamp' in mapServerTable(server({ stamp: bad as never }))).toBe(false);
    }
  });

  it('keeps the stamp on a table that cannot be edited and drops it when it is not text', () => {
    expect(mapServerTable(server({ unavailableReason: 'Runtime specific', stamp: 'd0.abc' })).stamp).toBe('d0.abc');
    expect('stamp' in mapServerTable(server({ unavailableReason: 'Runtime specific', stamp: 5 as never }))).toBe(false);
  });

  it('keeps an empty stamp text as it is', () => {
    expect(mapServerTable(server({ stamp: '' })).stamp).toBe('');
  });
});

describe('mapServerTables', () => {
  it('maps every entry, one per process and table, in the order sent', () => {
    const list = mapServerTables({
      tables: [server(), server({ processId: 'p2', processName: 'Second' })],
    });
    expect(list.map((t) => `${t.processId}:${t.id}`)).toEqual(['p1:t1', 'p2:t1']);
  });

  it('accepts an empty list', () => {
    expect(mapServerTables({ tables: [] })).toEqual([]);
  });

  it('rejects an answer that is not a list of tables', () => {
    for (const bad of [null, undefined, {}, { tables: 'x' }, 'text', []]) {
      expect(() => mapServerTables(bad)).toThrow(UNEXPECTED_ANSWER);
    }
  });

  it('rejects an entry without an id, a name or a process', () => {
    expect(() => mapServerTables({ tables: [{ name: 'x', processId: 'p' }] })).toThrow(UNEXPECTED_ANSWER);
    expect(() => mapServerTables({ tables: [null] })).toThrow(UNEXPECTED_ANSWER);
  });

  it('carries each stamp to its own table and still works with an older server that sends none', () => {
    const list = mapServerTables({
      tables: [server({ stamp: 'd0.aaa' }), server({ processId: 'p2', processName: 'Second' })],
    });
    expect(list[0].stamp).toBe('d0.aaa');
    expect(list[1].stamp).toBeUndefined();
  });
});

describe('mapServerLimits', () => {
  it('reads the largest save the server accepts', () => {
    expect(mapServerLimits({ tables: [], limits: { maxSaveBytes: 8388608 } })).toEqual({ maxSaveBytes: 8388608 });
  });

  it('gives an empty object for an older server, or for anything that is not a usable size', () => {
    expect(mapServerLimits({ tables: [] })).toEqual({});
    expect(mapServerLimits(null)).toEqual({});
    expect(mapServerLimits(undefined)).toEqual({});
    expect(mapServerLimits({ limits: null })).toEqual({});
    expect(mapServerLimits({ limits: {} })).toEqual({});
    for (const bad of ['8388608', 0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, {}]) {
      expect(mapServerLimits({ limits: { maxSaveBytes: bad } })).toEqual({});
    }
  });
});

describe('createLiveCrtDataSource', () => {
  it('asks the fetch once per listing and maps the answer', async () => {
    const fetchTables = vi.fn().mockResolvedValue({ tables: [server()] });
    const source = createLiveCrtDataSource(fetchTables);
    expect(fetchTables).not.toHaveBeenCalled();
    const list = await source.listTables();
    expect(fetchTables).toHaveBeenCalledTimes(1);
    expect(list[0].name).toBe('T01 Basic');
  });

  it('passes a failed fetch on unchanged', async () => {
    const source = createLiveCrtDataSource(() => Promise.reject(new Error('boom')));
    await expect(source.listTables()).rejects.toThrow('boom');
  });
});

describe('process names', () => {
  it('drops the pack name the platform puts in front of an installed process name', () => {
    expect(displayProcessName('Pack - Main Lookups', 'Pack')).toBe('Main Lookups');
    expect(displayProcessName('EmbedKit CRT Test - Multi - CRT Test - Second', 'EmbedKit CRT Test - Multi')).toBe('CRT Test - Second');
  });

  it('keeps a name that does not start with the pack name, or would be left empty', () => {
    expect(displayProcessName('Other - Main', 'Pack')).toBe('Other - Main');
    expect(displayProcessName('Pack - ', 'Pack')).toBe('Pack - ');
    expect(displayProcessName('Pack', 'Pack')).toBe('Pack');
    expect(displayProcessName('Pack-Main', 'Pack')).toBe('Pack-Main');
    expect(displayProcessName('Main', undefined)).toBe('Main');
    expect(displayProcessName('Main', '')).toBe('Main');
  });

  it('applies to every table of the answer, through the data source too', async () => {
    const source = createLiveCrtDataSource(
      async () => ({ tables: [server({ processName: 'Pack - Main' }), server({ processId: 'p2', processName: 'Pack - Second' })] }),
      { processNamePrefix: 'Pack' }
    );
    expect((await source.listTables()).map((t) => t.processName)).toEqual(['Main', 'Second']);
  });
});

describe('processes', () => {
  it('maps the process list, also processes with no table, with the pack name dropped for display', () => {
    const list = mapServerProcesses(
      { tables: [], processes: [{ id: 'p1', name: 'Pack - Main' }, { id: 'p2', name: 'Pack - Empty' }] },
      { processNamePrefix: 'Pack' }
    );
    expect(list).toEqual([{ id: 'p1', name: 'Main' }, { id: 'p2', name: 'Empty' }]);
  });

  it('gives an empty list for an older server that sends none, and ignores entries without an id', () => {
    expect(mapServerProcesses({ tables: [] })).toEqual([]);
    expect(mapServerProcesses(null)).toEqual([]);
    expect(mapServerProcesses({ processes: [null, { name: 'no id' }, { id: 'p', name: 7 }] })).toEqual([{ id: 'p', name: '' }]);
  });

  it('asks the server once for the tables and the processes together', async () => {
    const fetchTables = vi.fn().mockResolvedValue({ tables: [server()], processes: [{ id: 'p1', name: 'Main' }] });
    const source = createLiveCrtDataSource(fetchTables);
    const [tables, processes] = await Promise.all([source.listTables(), source.listProcesses!()]);
    expect(fetchTables).toHaveBeenCalledTimes(1);
    expect(tables).toHaveLength(1);
    expect(processes).toEqual([{ id: 'p1', name: 'Main' }]);
  });

  it('a failed request fails both calls', async () => {
    const source = createLiveCrtDataSource(() => Promise.reject(new Error('boom')));
    await expect(source.listTables()).rejects.toThrow('boom');
    await expect(source.listProcesses!()).rejects.toThrow('boom');
  });
});

describe('limits', () => {
  it('gives the save limit from the same single answer as the tables and the processes', async () => {
    const fetchTables = vi.fn().mockResolvedValue({
      tables: [server({ stamp: 'd0.aaa' })],
      processes: [{ id: 'p1', name: 'Main' }],
      limits: { maxSaveBytes: 8388608 },
    });
    const source = createLiveCrtDataSource(fetchTables);
    const [tables, processes, limits] = await Promise.all([source.listTables(), source.listProcesses!(), source.limits!()]);
    expect(fetchTables).toHaveBeenCalledTimes(1);
    expect(tables[0].stamp).toBe('d0.aaa');
    expect(processes).toHaveLength(1);
    expect(limits).toEqual({ maxSaveBytes: 8388608 });
  });

  it('asking for the limit first still makes one request in total', async () => {
    const fetchTables = vi.fn().mockResolvedValue({ tables: [server()], limits: { maxSaveBytes: 1024 } });
    const source = createLiveCrtDataSource(fetchTables);
    expect(await source.limits!()).toEqual({ maxSaveBytes: 1024 });
    await source.listTables();
    expect(fetchTables).toHaveBeenCalledTimes(1);
  });

  it('gives no limit when the server sends none', async () => {
    const source = createLiveCrtDataSource(async () => ({ tables: [server()] }));
    expect(await source.limits!()).toEqual({});
  });

  it('a failed request fails the limit call too', async () => {
    const source = createLiveCrtDataSource(() => Promise.reject(new Error('boom')));
    await expect(source.limits!()).rejects.toThrow('boom');
  });
});
