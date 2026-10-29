/**
 * @file listState.ts
 * @license BSD-2-Clause
 *
 * Remembers where the integrations list was (page and filters) for the length of the browser
 * tab, so coming back from a pack lands on the same page. Session storage, so a new tab or a
 * new day starts clean. A search is never remembered: while one is active the caller stores
 * page 1, because a page number only makes sense for the list it was taken from.
 */
import type { ListFilters } from '../service/integrationPacks.service';

export type ListState = { page: number; filters: ListFilters };

const STATE_PREFIX = 'integrations-list-state:';
const MAX_PAGE = 100_000;
const MAX_IDS = 200;
const MAX_ID_LENGTH = 200;

const cleanIds = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= MAX_ID_LENGTH).slice(0, MAX_IDS) : [];

/** The remembered page and filters, or undefined when nothing usable is stored. */
export function readListState(componentKey: string): ListState | undefined {
  try {
    const raw = sessionStorage.getItem(`${STATE_PREFIX}${componentKey}`);
    if (!raw) return undefined;
    const v = JSON.parse(raw) as { page?: unknown; filters?: { environmentIds?: unknown; connectorTypes?: unknown } } | null;
    if (!v || typeof v !== 'object') return undefined;
    const page = Number.isInteger(v.page) && (v.page as number) >= 1 && (v.page as number) <= MAX_PAGE ? (v.page as number) : 1;
    return {
      page,
      filters: { environmentIds: cleanIds(v.filters?.environmentIds), connectorTypes: cleanIds(v.filters?.connectorTypes) },
    };
  } catch {
    return undefined;
  }
}

/** Remembers the state. The plain starting state (page 1, no filters) is not stored. */
export function writeListState(componentKey: string, state: ListState): void {
  try {
    const plain = state.page <= 1 && !state.filters.environmentIds.length && !state.filters.connectorTypes.length;
    if (plain) sessionStorage.removeItem(`${STATE_PREFIX}${componentKey}`);
    else sessionStorage.setItem(`${STATE_PREFIX}${componentKey}`, JSON.stringify(state));
  } catch {
    // storage unavailable: the state just is not remembered
  }
}
