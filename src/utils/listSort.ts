/**
 * @file listSort.ts
 * @license BSD-2-Clause
 *
 * Sort options of the integrations list: which ones exist, their labels, the direction a
 * first pick starts in, and how the host's `integrations.sort` config is read. The table
 * headers and the Sort by menu share these, so both always offer the same options.
 */

export type ListSortBy = 'name' | 'description' | 'environment' | 'created' | 'lastViewed';
export type ListSortDir = 'asc' | 'desc';
export type ListSort = { by: ListSortBy; dir: ListSortDir };

/** Every option, in the order the menu shows them. */
export const LIST_SORT_OPTIONS: ListSortBy[] = ['name', 'description', 'environment', 'created', 'lastViewed'];

/** Sorts that servers released before they existed reject. */
const NEWER_SORTS: ListSortBy[] = ['created', 'lastViewed'];
export const isNewerSort = (by: ListSortBy): boolean => NEWER_SORTS.includes(by);

export const SORT_LABELS: Record<ListSortBy, string> = {
  name: 'Name',
  description: 'Description',
  environment: 'Environment',
  created: 'Created',
  lastViewed: 'Last viewed',
};

/** Direction a first pick starts in: text A to Z, dates newest first. */
export const FIRST_DIRECTION: Record<ListSortBy, ListSortDir> = {
  name: 'asc',
  description: 'asc',
  environment: 'asc',
  created: 'desc',
  lastViewed: 'desc',
};

export const DIRECTION_LABELS: Record<ListSortBy, Record<ListSortDir, string>> = {
  name: { asc: 'A to Z', desc: 'Z to A' },
  description: { asc: 'A to Z', desc: 'Z to A' },
  environment: { asc: 'A to Z', desc: 'Z to A' },
  created: { asc: 'Oldest first', desc: 'Newest first' },
  lastViewed: { asc: 'Least recent first', desc: 'Most recent first' },
};

const isSortBy = (v: unknown): v is ListSortBy => LIST_SORT_OPTIONS.includes(v as ListSortBy);

/**
 * Options the Sort by menu offers: the host's `integrations.sort.options` (unknown names are
 * ignored, order kept), else all of them. Environment is left out when environments are not shown.
 */
export function resolveSortOptions(configured: unknown, showEnvironment: boolean): ListSortBy[] {
  const base = Array.isArray(configured) ? configured.filter(isSortBy) : LIST_SORT_OPTIONS;
  const unique = base.filter((by, i) => base.indexOf(by) === i);
  return unique.filter((by) => showEnvironment || by !== 'environment');
}

/** Starting sort from the host's `integrations.sort.default`, or undefined (Default order) when absent or not one of the options. */
export function resolveDefaultSort(configured: unknown, options: ListSortBy[]): ListSort | undefined {
  const c = configured as { by?: unknown; dir?: unknown } | null | undefined;
  if (!c || !isSortBy(c.by) || !options.includes(c.by)) return undefined;
  return { by: c.by, dir: c.dir === 'asc' || c.dir === 'desc' ? c.dir : FIRST_DIRECTION[c.by] };
}

/** The sort after picking a menu row: the first pick starts in the natural direction, the active row flips, null clears. */
export function nextSortFromMenu(current: ListSort | undefined, by: ListSortBy | null): ListSort | undefined {
  if (by === null) return undefined;
  if (current?.by === by) return { by, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { by, dir: FIRST_DIRECTION[by] };
}

const SORT_STORE_PREFIX = 'integrations-list-sort:';
/** Stored in place of a sort when the user picked Default order on purpose. */
const DEFAULT_ORDER_MARK = 'default';

/**
 * The sort this browser remembers for the list: a sort, null when Default order was picked on
 * purpose, undefined when nothing usable is stored (so the host's default applies).
 */
export function readStoredSort(componentKey: string, options: ListSortBy[]): ListSort | null | undefined {
  try {
    const raw = localStorage.getItem(`${SORT_STORE_PREFIX}${componentKey}`);
    if (raw === null) return undefined;
    if (raw === DEFAULT_ORDER_MARK) return null;
    const v = JSON.parse(raw) as { by?: unknown; dir?: unknown } | null;
    if (v && isSortBy(v.by) && options.includes(v.by) && (v.dir === 'asc' || v.dir === 'desc')) return { by: v.by, dir: v.dir };
  } catch {
    // storage unavailable or unreadable: behave as if nothing was stored
  }
  return undefined;
}

/** Remembers the user's choice (undefined = Default order) for the next time the list opens. */
export function storeSort(componentKey: string, sort: ListSort | undefined): void {
  try {
    localStorage.setItem(`${SORT_STORE_PREFIX}${componentKey}`, sort ? JSON.stringify(sort) : DEFAULT_ORDER_MARK);
  } catch {
    // storage unavailable: the choice just is not remembered
  }
}

/** Drops the remembered choice, so the host's default applies again. */
export function forgetStoredSort(componentKey: string): void {
  try {
    localStorage.removeItem(`${SORT_STORE_PREFIX}${componentKey}`);
  } catch {
    // nothing to do
  }
}

/** Where the list starts: the remembered choice, else the host's `integrations.sort.default`, else Default order. */
export function resolveInitialSort(componentKey: string, configuredDefault: unknown, options: ListSortBy[]): ListSort | undefined {
  const stored = readStoredSort(componentKey, options);
  if (stored === null) return undefined;
  return stored ?? resolveDefaultSort(configuredDefault, options);
}
