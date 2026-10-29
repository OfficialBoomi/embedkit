/**
 * @file useFetchIntegrationPackInstances.tsx
 * @function useFetchIntegrationPackInstances
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlugin } from '../../context/pluginContext';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { useIntegrationPacksService, type ListFilters, type ListSort } from '../../service/integrationPacks.service';
import logger from '../../logger.service';
import { resolvePageSize } from '../../utils/pagination';
import { isNewerSort } from '../../utils/listSort';

/**
 * @function fetchIntegrationPackInstances
 *
 * @description
 * Internal async helper that:
 *  - Resolves the account group ID.
 *  - Retrieves integration packs available to that group.
 *  - Queries pack instances, applies search, paginates, and enriches results
 *    with installation type, display name/description, and attached env IDs.
 *
 * @returns {Promise<void>} Resolves when state has been updated.
 */
export const useFetchIntegrationPackInstances = ({
  search,
  renderType,
  includeConnectors = false,
  sort,
  filters,
  pageSize,
  initialPage,
}: {
  search?: string;
  renderType: string;
  includeConnectors?: boolean;
  /** Items per page, 1 to 30. Default 12. */
  pageSize?: number;
  /** Server-side order of the whole list. */
  sort?: ListSort;
  /** Server-side environment / connector filter. Callers reset to page 1 when it changes. */
  filters?: ListFilters;
  /** Page to start on (default 1), for example when coming back to a list the user had paged. */
  initialPage?: number;
}) => {
  const sortKey = sort ? `${sort.by}:${sort.dir}` : '';
  const filterKey = filters ? `${filters.environmentIds.join(',')}|${filters.connectorTypes.join(',')}` : '';
  const [integrationPackInstances, setIntegrationPackInstances] = useState<IntegrationPackInstance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(() =>
    Number.isInteger(initialPage) && (initialPage as number) >= 1 ? (initialPage as number) : 1
  );
  const [totalPages, setTotalPages] = useState(1);
  // Set when the server rejected a Created or Last viewed sort that an older server does not know.
  const [sortUnsupported, setSortUnsupported] = useState(false);
  const sortUnsupportedRef = useRef(false);
  const hasFetchedRef = useRef(false);          
  const lastKeyRef = useRef<string | null>(null); 
  const { boomiConfig } = usePlugin();

  const { getIntegrationPacks } = useIntegrationPacksService();
  const size = resolvePageSize(pageSize, 'integrations');

  const fetchIntegrationPacks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const activeSort = sort && !(sortUnsupportedRef.current && isNewerSort(sort.by)) ? sort : undefined;
      const request = (withSort: boolean) =>
        getIntegrationPacks({
          renderType,
          search,
          page: currentPage,
          pageSize: size,
          includeConnectors,
          ...(withSort && activeSort ? { sort: activeSort } : {}),
          ...(filters ? { filters } : {}),
        });
      let resp;
      try {
        resp = await request(true);
      } catch (e: unknown) {
        // An older server rejects the newer sort values with a 400 or 500. Load the list without the
        // sort and tell the caller to stop offering them. A failure that also happens without the sort
        // is a real error and is reported as before.
        const status = Number((e as { status?: unknown } | null)?.status);
        if (activeSort && isNewerSort(activeSort.by) && (status === 400 || status === 500)) {
          try {
            resp = await request(false);
          } catch {
            throw e;
          }
          sortUnsupportedRef.current = true;
          setSortUnsupported(true);
          logger.warn(`[useFetchIntegrationPackInstances] server does not support sort "${activeSort.by}"; listing without it`);
        } else {
          throw e;
        }
      }
      logger.debug('[useFetchIntegrationPackInstances] fetched packs', resp);
      
      let instances: IntegrationPackInstance[] = [];
      if (resp && resp.result) {
        resp.result.forEach((instance: any) => {
          logger.debug(`Eligible Instance: ID=${instance.integrationPackId}, Name=${instance.name}`);
          if (boomiConfig?.agents?.[instance.integrationPackId]?.allowInstall !== false) {
            logger.debug(`Excluding Installed Integration=${instance.integrationPackId} due to existing instance or disallowed install.`);
            instances.push(instance);
          }
        });
      }
      setIntegrationPackInstances(instances || []);
      setTotalPages(resp.totalPages || 1);
      // The server shows the last page when the one asked for no longer exists (for example after
      // deletions since the page was remembered). Follow it so the page controls tell the truth.
      if (typeof resp.page === 'number' && resp.page >= 1 && resp.page !== currentPage) setCurrentPage(resp.page);
    } catch (e: any) {
      const msg = e?.message || 'Failed to load integration packs';
      logger.error({ err: e }, '[useFetchIntegrationPackInstances] fetch failed');
      setError(msg);
      setIntegrationPackInstances([]);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getIntegrationPacks, search, currentPage, includeConnectors, sortKey, filterKey, size]);

  // 1) Initial load once
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    lastKeyRef.current = `${currentPage}|${search ?? ''}|${sortKey}|${filterKey}|${size}`;
    void fetchIntegrationPacks();
  }, [fetchIntegrationPacks, currentPage, search]);

  // 2) Subsequent loads only when page/search actually change (skip initial)
  useEffect(() => {
    if (!hasFetchedRef.current) return; // skip the very first mount
    const key = `${currentPage}|${search ?? ''}|${sortKey}|${filterKey}|${size}`;
    if (key === lastKeyRef.current) return; // de-dupe (handles StrictMode re-run)
    lastKeyRef.current = key;
    void fetchIntegrationPacks();
  }, [currentPage, search, sortKey, filterKey, size, fetchIntegrationPacks]);

  /** Filter options (environments, connector types) for the current search, before any filter. */
  const loadFacets = useCallback(async () => {
    const resp = await getIntegrationPacks({ renderType, search, page: 1, pageSize: 1, includeFacets: true });
    return resp?.facets ?? { environments: [], connectors: [] };
  }, [getIntegrationPacks, renderType, search]);

  const goToPage = useCallback((page: number) => {
    if (page >= 1) setCurrentPage(page);
  }, []);

  return useMemo(() => ({
    integrationPackInstances,
    refetch: fetchIntegrationPacks,
    isLoading,
    error,
    currentPage,
    totalPages,
    goToPage,
    loadFacets,
    sortUnsupported,
  }), [integrationPackInstances, fetchIntegrationPacks, isLoading, error, currentPage, totalPages, goToPage, loadFacets, sortUnsupported]);
};
