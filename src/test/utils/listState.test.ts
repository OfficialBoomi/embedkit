/**
 * @file listState.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readListState, writeListState } from '../../utils/listState';

const filters = (environmentIds: string[] = [], connectorTypes: string[] = []) => ({ environmentIds, connectorTypes });

describe('remembered list state', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reads nothing when nothing was stored', () => {
    expect(readListState('main')).toBeUndefined();
  });

  it('stores the page and filters and reads them back, per component key', () => {
    writeListState('main', { page: 3, filters: filters(['env1'], ['salesforce']) });
    expect(readListState('main')).toEqual({ page: 3, filters: filters(['env1'], ['salesforce']) });
    expect(readListState('other')).toBeUndefined();
  });

  it('keeps filters on page 1', () => {
    writeListState('main', { page: 1, filters: filters(['env1']) });
    expect(readListState('main')).toEqual({ page: 1, filters: filters(['env1']) });
  });

  it('does not store the plain starting state', () => {
    writeListState('main', { page: 3, filters: filters() });
    writeListState('main', { page: 1, filters: filters() });
    expect(readListState('main')).toBeUndefined();
    expect(sessionStorage.length).toBe(0);
  });

  it('uses session storage, not local storage', () => {
    const local = { length: 0, getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), key: vi.fn() };
    vi.stubGlobal('localStorage', local);
    writeListState('main', { page: 2, filters: filters() });
    expect(local.setItem).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(1);
  });

  it('repairs unusable values instead of passing them on', () => {
    sessionStorage.setItem('integrations-list-state:main', JSON.stringify({ page: -4, filters: { environmentIds: ['ok', 7, '', null], connectorTypes: 'x' } }));
    expect(readListState('main')).toEqual({ page: 1, filters: filters(['ok'], []) });
    sessionStorage.setItem('integrations-list-state:main', JSON.stringify({ page: 2.5 }));
    expect(readListState('main')).toEqual({ page: 1, filters: filters() });
    sessionStorage.setItem('integrations-list-state:main', '{not json');
    expect(readListState('main')).toBeUndefined();
    sessionStorage.setItem('integrations-list-state:main', 'null');
    expect(readListState('main')).toBeUndefined();
  });

  it('does not throw when storage is unavailable', () => {
    const fail = () => { throw new Error('blocked'); };
    vi.stubGlobal('sessionStorage', { length: 0, getItem: fail, setItem: fail, removeItem: fail, clear: fail, key: fail });
    expect(readListState('main')).toBeUndefined();
    expect(() => writeListState('main', { page: 2, filters: filters() })).not.toThrow();
  });
});
