/**
 * @file crossReferenceTables.service.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The cross reference table service: the request each call makes and what it passes back.
 * The HTTP client is replaced, so nothing is sent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));
const log = vi.hoisted(() => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));

vi.mock('../../service/http', () => ({ useHttp: () => http }));
vi.mock('../../logger.service', () => ({ default: log }));

import {
  useCrossReferenceTablesService,
  type CrossReferenceTableWriteResult,
} from '../../service/crossReferenceTables.service';

const ids = { integrationPackInstanceId: 'ipi-1', environmentId: 'env-1', processId: 'proc-1', tableId: 'table-1' };
const result: CrossReferenceTableWriteResult = { processId: 'proc-1', tableId: 'table-1', overridden: true, rowCount: 2, stamp: 'o2.abc' };

beforeEach(() => {
  http.get.mockReset();
  http.post.mockReset();
  log.debug.mockReset();
});

describe('fetchCrossReferenceTables', () => {
  it('is unchanged: GET with the pack and environment as query parameters', async () => {
    const answer = { tables: [] };
    http.get.mockResolvedValue(answer);
    const signal = new AbortController().signal;
    const out = await useCrossReferenceTablesService().fetchCrossReferenceTables({
      integrationPackInstanceId: 'ipi-1',
      environmentId: 'env-1',
      signal,
    });
    expect(out).toBe(answer);
    expect(http.get).toHaveBeenCalledWith('/cross-reference-tables', {
      params: { integrationPackInstanceId: 'ipi-1', environmentId: 'env-1' },
      signal,
    });
  });
});

describe('saveCrossReferenceTable', () => {
  const rows = [['a', 'b'], ['c', 'd']];

  it('POSTs the ids, the rows and the expected stamp to the save route and returns the answer', async () => {
    http.post.mockResolvedValue(result);
    const out = await useCrossReferenceTablesService().saveCrossReferenceTable({ ...ids, rows, expectedStamp: 'd0.xyz' });
    expect(out).toBe(result);
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      '/cross-reference-tables/save',
      { ...ids, rows, expectedStamp: 'd0.xyz' },
      { signal: undefined }
    );
  });

  it('leaves the stamp out of the body when none is given (a deliberate overwrite)', async () => {
    http.post.mockResolvedValue(result);
    await useCrossReferenceTablesService().saveCrossReferenceTable({ ...ids, rows });
    const body = http.post.mock.calls[0][1];
    expect(body).toEqual({ ...ids, rows });
    expect('expectedStamp' in body).toBe(false);
  });

  it('keeps the abort signal out of the body and hands it to the client', async () => {
    http.post.mockResolvedValue(result);
    const signal = new AbortController().signal;
    await useCrossReferenceTablesService().saveCrossReferenceTable({ ...ids, rows, signal });
    expect('signal' in http.post.mock.calls[0][1]).toBe(false);
    expect(http.post.mock.calls[0][2]).toEqual({ signal });
  });

  it('sends the rows exactly, including blanks, spaces and an empty table', async () => {
    http.post.mockResolvedValue({ ...result, rowCount: 0 });
    await useCrossReferenceTablesService().saveCrossReferenceTable({ ...ids, rows: [['', ' x '], ['007', '']] });
    expect(http.post.mock.calls[0][1].rows).toEqual([['', ' x '], ['007', '']]);
    await useCrossReferenceTablesService().saveCrossReferenceTable({ ...ids, rows: [] });
    expect(http.post.mock.calls[1][1].rows).toEqual([]);
  });

  it('passes the failure on unchanged, so the server code stays readable', async () => {
    const failure = Object.assign(new Error('changed'), { status: 409, body: { code: 'TABLE_CHANGED', currentStamp: 'o1.q' } });
    http.post.mockRejectedValue(failure);
    await expect(useCrossReferenceTablesService().saveCrossReferenceTable({ ...ids, rows })).rejects.toBe(failure);
  });

  it('logs ids and a row count, never the cell values', async () => {
    http.post.mockResolvedValue(result);
    await useCrossReferenceTablesService().saveCrossReferenceTable({ ...ids, rows: [['secret-cell-value', 'another-one']] });
    const logged = JSON.stringify(log.debug.mock.calls);
    expect(logged).toContain('saveCrossReferenceTable');
    expect(logged).toContain('"rowCount":1');
    expect(logged).not.toContain('secret-cell-value');
    expect(logged).not.toContain('another-one');
  });
});

describe('resetCrossReferenceTable', () => {
  it('POSTs the ids and the expected stamp to the reset route, with no rows', async () => {
    http.post.mockResolvedValue({ ...result, overridden: false, rowCount: 0, stamp: 'd0.xyz' });
    const out = await useCrossReferenceTablesService().resetCrossReferenceTable({ ...ids, expectedStamp: 'o2.abc' });
    expect(out).toMatchObject({ overridden: false, stamp: 'd0.xyz' });
    expect(http.post).toHaveBeenCalledWith('/cross-reference-tables/reset', { ...ids, expectedStamp: 'o2.abc' }, { signal: undefined });
    expect('rows' in http.post.mock.calls[0][1]).toBe(false);
  });

  it('leaves the stamp out when none is given and keeps the signal out of the body', async () => {
    http.post.mockResolvedValue(result);
    const signal = new AbortController().signal;
    await useCrossReferenceTablesService().resetCrossReferenceTable({ ...ids, signal });
    expect(http.post.mock.calls[0][1]).toEqual(ids);
    expect(http.post.mock.calls[0][2]).toEqual({ signal });
  });

  it('passes the failure on unchanged', async () => {
    const failure = new Error('boom');
    http.post.mockRejectedValue(failure);
    await expect(useCrossReferenceTablesService().resetCrossReferenceTable(ids)).rejects.toBe(failure);
  });
});

describe('fetchCrossReferenceHistory', () => {
  const answer = {
    environment: { at: '2026-11-09T22:40:00Z', by: 'someone@example.com', viaUi: true },
    tables: [{ processId: 'proc-1', tableId: 'table-1', at: '2026-11-09T22:41:00Z', by: 'u-1', action: 'save', rowCount: 6 }],
  };

  it('GETs the history route with the environment and the pack as query parameters', async () => {
    http.get.mockResolvedValue(answer);
    const signal = new AbortController().signal;
    const out = await useCrossReferenceTablesService().fetchCrossReferenceHistory({
      environmentId: 'env-1',
      integrationPackInstanceId: 'ipi-1',
      signal,
    });
    expect(out).toBe(answer);
    expect(http.get).toHaveBeenCalledWith('/cross-reference-tables/history', {
      params: { environmentId: 'env-1', integrationPackInstanceId: 'ipi-1' },
      signal,
    });
  });

  it('sends only the environment when no pack is given, and keeps the signal out of the parameters', async () => {
    http.get.mockResolvedValue(answer);
    await useCrossReferenceTablesService().fetchCrossReferenceHistory({ environmentId: 'env-1' });
    expect(http.get.mock.calls[0][1].params).toEqual({ environmentId: 'env-1' });
    expect('signal' in http.get.mock.calls[0][1].params).toBe(false);
  });

  it('passes the failure on unchanged, so a 404 from an older server stays readable', async () => {
    const failure = Object.assign(new Error('Not Found'), { status: 404 });
    http.get.mockRejectedValue(failure);
    await expect(useCrossReferenceTablesService().fetchCrossReferenceHistory({ environmentId: 'env-1' })).rejects.toBe(failure);
  });

  it('logs the ids only, never who saved', async () => {
    http.get.mockResolvedValue(answer);
    await useCrossReferenceTablesService().fetchCrossReferenceHistory({ environmentId: 'env-1' });
    const logged = JSON.stringify(log.debug.mock.calls);
    expect(logged).toContain('fetchCrossReferenceHistory');
    expect(logged).not.toContain('someone@example.com');
  });
});

describe('the hook', () => {
  it('still gives the existing functions first, then the history one', () => {
    const service = useCrossReferenceTablesService();
    expect(Object.keys(service)).toEqual([
      'fetchCrossReferenceTables',
      'saveCrossReferenceTable',
      'resetCrossReferenceTable',
      'fetchCrossReferenceHistory',
    ]);
  });
});
