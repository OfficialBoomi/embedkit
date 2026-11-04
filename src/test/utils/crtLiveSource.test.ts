/**
 * @file crtLiveSource.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createLiveCrtDataSource,
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
