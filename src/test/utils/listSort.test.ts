/**
 * @file listSort.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LIST_SORT_OPTIONS,
  forgetStoredSort,
  isNewerSort,
  nextSortFromMenu,
  readStoredSort,
  resolveDefaultSort,
  resolveInitialSort,
  resolveSortOptions,
  storeSort,
} from '../../utils/listSort';

describe('resolveSortOptions', () => {
  it('offers all five options by default, in menu order', () => {
    expect(resolveSortOptions(undefined, true)).toEqual(['name', 'description', 'environment', 'created', 'lastViewed']);
    expect(resolveSortOptions(undefined, true)).toEqual(LIST_SORT_OPTIONS);
  });

  it('leaves Environment out when environments are not shown', () => {
    expect(resolveSortOptions(undefined, false)).toEqual(['name', 'description', 'created', 'lastViewed']);
  });

  it('uses the host list, keeping its order and dropping unknown or repeated names', () => {
    expect(resolveSortOptions(['lastViewed', 'bogus', 'name', 'lastViewed'], true)).toEqual(['lastViewed', 'name']);
  });

  it('ignores a configured value that is not a list', () => {
    expect(resolveSortOptions('name', true)).toEqual(LIST_SORT_OPTIONS);
  });
});

describe('resolveDefaultSort', () => {
  const all = resolveSortOptions(undefined, true);

  it('is Default order (undefined) when nothing is configured', () => {
    expect(resolveDefaultSort(undefined, all)).toBeUndefined();
    expect(resolveDefaultSort(null, all)).toBeUndefined();
    expect(resolveDefaultSort({}, all)).toBeUndefined();
  });

  it('uses the configured sort and direction', () => {
    expect(resolveDefaultSort({ by: 'name', dir: 'desc' }, all)).toEqual({ by: 'name', dir: 'desc' });
  });

  it('starts in the natural direction when none is given or it is invalid', () => {
    expect(resolveDefaultSort({ by: 'created' }, all)).toEqual({ by: 'created', dir: 'desc' });
    expect(resolveDefaultSort({ by: 'name', dir: 'sideways' }, all)).toEqual({ by: 'name', dir: 'asc' });
  });

  it('ignores a default that is not one of the offered options', () => {
    expect(resolveDefaultSort({ by: 'bogus' }, all)).toBeUndefined();
    expect(resolveDefaultSort({ by: 'environment' }, resolveSortOptions(undefined, false))).toBeUndefined();
  });
});

describe('nextSortFromMenu', () => {
  it('starts text sorts A to Z and date sorts newest first', () => {
    expect(nextSortFromMenu(undefined, 'name')).toEqual({ by: 'name', dir: 'asc' });
    expect(nextSortFromMenu(undefined, 'created')).toEqual({ by: 'created', dir: 'desc' });
    expect(nextSortFromMenu(undefined, 'lastViewed')).toEqual({ by: 'lastViewed', dir: 'desc' });
  });

  it('picking another option starts it fresh', () => {
    expect(nextSortFromMenu({ by: 'name', dir: 'desc' }, 'created')).toEqual({ by: 'created', dir: 'desc' });
  });

  it('picking the active option flips its direction', () => {
    expect(nextSortFromMenu({ by: 'name', dir: 'asc' }, 'name')).toEqual({ by: 'name', dir: 'desc' });
    expect(nextSortFromMenu({ by: 'created', dir: 'desc' }, 'created')).toEqual({ by: 'created', dir: 'asc' });
  });

  it('Default order clears the sort', () => {
    expect(nextSortFromMenu({ by: 'name', dir: 'asc' }, null)).toBeUndefined();
  });
});

describe('isNewerSort', () => {
  it('flags only the two sorts an older server does not know', () => {
    expect(LIST_SORT_OPTIONS.filter(isNewerSort)).toEqual(['created', 'lastViewed']);
  });
});

// Node's own localStorage stub is unavailable in the test run, so use an in-memory one.
const memoryStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
  } as Storage;
};
const blockedStorage = (): Storage => {
  const fail = () => { throw new Error('blocked'); };
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail } as unknown as Storage;
};

describe('remembered sort', () => {
  const all = resolveSortOptions(undefined, true);
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reads nothing when nothing was stored', () => {
    expect(readStoredSort('main', all)).toBeUndefined();
  });

  it('stores a sort and reads it back, per component key', () => {
    storeSort('main', { by: 'created', dir: 'desc' });
    expect(readStoredSort('main', all)).toEqual({ by: 'created', dir: 'desc' });
    expect(readStoredSort('other', all)).toBeUndefined();
  });

  it('remembers a deliberate Default order as null', () => {
    storeSort('main', undefined);
    expect(readStoredSort('main', all)).toBeNull();
  });

  it('ignores a stored sort that is no longer offered or is damaged', () => {
    storeSort('main', { by: 'lastViewed', dir: 'desc' });
    expect(readStoredSort('main', resolveSortOptions(['name'], true))).toBeUndefined();
    localStorage.setItem('integrations-list-sort:main', '{not json');
    expect(readStoredSort('main', all)).toBeUndefined();
    localStorage.setItem('integrations-list-sort:main', JSON.stringify({ by: 'name', dir: 'sideways' }));
    expect(readStoredSort('main', all)).toBeUndefined();
  });

  it('forgets a stored sort', () => {
    storeSort('main', { by: 'name', dir: 'asc' });
    forgetStoredSort('main');
    expect(readStoredSort('main', all)).toBeUndefined();
  });

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', blockedStorage());
    expect(readStoredSort('main', all)).toBeUndefined();
    expect(() => storeSort('main', { by: 'name', dir: 'asc' })).not.toThrow();
    expect(() => forgetStoredSort('main')).not.toThrow();
  });

  it('does not throw when there is no localStorage at all', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readStoredSort('main', all)).toBeUndefined();
    expect(() => storeSort('main', { by: 'name', dir: 'asc' })).not.toThrow();
  });
});

describe('resolveInitialSort', () => {
  const all = resolveSortOptions(undefined, true);
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('is Default order with nothing stored and no host default', () => {
    expect(resolveInitialSort('main', undefined, all)).toBeUndefined();
  });

  it('uses the host default when nothing is stored', () => {
    expect(resolveInitialSort('main', { by: 'name', dir: 'desc' }, all)).toEqual({ by: 'name', dir: 'desc' });
  });

  it('prefers what the user chose over the host default', () => {
    storeSort('main', { by: 'created', dir: 'asc' });
    expect(resolveInitialSort('main', { by: 'name', dir: 'desc' }, all)).toEqual({ by: 'created', dir: 'asc' });
  });

  it('keeps a deliberate Default order even when the host sets a default', () => {
    storeSort('main', undefined);
    expect(resolveInitialSort('main', { by: 'name', dir: 'desc' }, all)).toBeUndefined();
  });
});
