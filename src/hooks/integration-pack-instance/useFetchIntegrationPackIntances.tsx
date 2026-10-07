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

const PAGE_SIZE = 12;

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
}: {
  search?: string;
  renderType: string;
  includeConnectors?: boolean;
  /** Server-side order of the whole list. */
  sort?: ListSort;
  /** Server-side environment / connector filter. Callers reset to page 1 when it changes. */
  filters?: ListFilters;
}) => {
  const sortKey = sort ? `${sort.by}:${sort.dir}` : '';
  const filterKey = filters ? `${filters.environmentIds.join(',')}|${filters.connectorTypes.join(',')}` : '';
  const [integrationPackInstances, setIntegrationPackInstances] = useState<IntegrationPackInstance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const hasFetchedRef = useRef(false);          
  const lastKeyRef = useRef<string | null>(null); 
  const { boomiConfig } = usePlugin();

  const { getIntegrationPacks } = useIntegrationPacksService();
  const PAGE_SIZE = 12;

  const fetchIntegrationPacks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await getIntegrationPacks({
        renderType,
        search,
        page: currentPage,
        pageSize: PAGE_SIZE,
        includeConnectors,
        ...(sort ? { sort } : {}),
        ...(filters ? { filters } : {}),
      });
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
  }, [getIntegrationPacks, search, currentPage, includeConnectors, sortKey, filterKey]);

  // 1) Initial load once
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    lastKeyRef.current = `${currentPage}|${search ?? ''}|${sortKey}|${filterKey}`;
    void fetchIntegrationPacks();
  }, [fetchIntegrationPacks, currentPage, search]);

  // 2) Subsequent loads only when page/search actually change (skip initial)
  useEffect(() => {
    if (!hasFetchedRef.current) return; // skip the very first mount
    const key = `${currentPage}|${search ?? ''}|${sortKey}|${filterKey}`;
    if (key === lastKeyRef.current) return; // de-dupe (handles StrictMode re-run)
    lastKeyRef.current = key;
    void fetchIntegrationPacks();
  }, [currentPage, search, sortKey, filterKey, fetchIntegrationPacks]);

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
  }), [integrationPackInstances, fetchIntegrationPacks, isLoading, error, currentPage, totalPages, goToPage, loadFacets]);
};
