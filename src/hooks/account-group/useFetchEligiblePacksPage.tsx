/**
 * @file useFetchEligiblePacksPage.tsx
 * @function useFetchEligiblePacksPage
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Server-paged eligible integration packs for the Add Integration catalog.
 * Search is debounced and resets to page 1; stale responses are ignored, so
 * fast typing or paging never shows an older result.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlugin } from '../../context/pluginContext';
import { useIntegrationPacksService, type EligiblePacksPage } from '../../service/integrationPacks.service';
import logger from '../../logger.service';

export type UseFetchEligiblePacksPageArgs = {
  renderType: string;
  pageSize?: number;
  debounceMs?: number;
};

export const useFetchEligiblePacksPage = <T = any,>({ renderType, pageSize = 12, debounceMs = 300 }: UseFetchEligiblePacksPageArgs) => {
  const { boomiConfig } = usePlugin();
  // The service object is recreated on every render; keep the latest function in a
  // ref so it doesn't retrigger the load effect (which would loop).
  const { getEligibleIntegrationPacksPage } = useIntegrationPacksService();
  const fetchPageRef = useRef(getEligibleIntegrationPacksPage);
  fetchPageRef.current = getEligibleIntegrationPacksPage;

  const [search, setSearchRaw] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EligiblePacksPage<T>>({ result: [], page: 1, pageSize, numberOfResults: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Debounce search; a new search always starts on page 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, debounceMs);
    return () => clearTimeout(t);
  }, [search, debounceMs]);

  const notAllowedIds = Object.entries(boomiConfig?.agents ?? {})
    .filter(([, cfg]: [string, any]) => cfg?.allowInstall === false)
    .map(([id]) => id);
  const notAllowedKey = notAllowedIds.join(',');

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const resp = await fetchPageRef.current({
        renderType,
        page,
        pageSize,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(notAllowedIds.length ? { notAllowedIds } : {}),
      });
      if (id !== requestId.current) return; // a newer request superseded this one
      setData({
        result: (resp?.result ?? []) as T[],
        page: resp?.page ?? page,
        pageSize: resp?.pageSize ?? pageSize,
        numberOfResults: resp?.numberOfResults ?? (resp?.result?.length ?? 0),
        totalPages: Math.max(1, resp?.totalPages ?? 1),
      });
    } catch (e: any) {
      if (id !== requestId.current) return;
      const msg = e?.message || 'Failed to load integrations';
      logger.error('[useFetchEligiblePacksPage] fetch failed', e);
      setError(msg);
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderType, page, pageSize, debouncedSearch, notAllowedKey]);

  useEffect(() => { void load(); }, [load]);

  const goToPage = useCallback((p: number) => setPage(Math.max(1, Math.floor(p))), []);

  return {
    packs: data.result,
    page: data.page,
    pageSize: data.pageSize,
    total: data.numberOfResults,
    totalPages: data.totalPages,
    search,
    setSearch: setSearchRaw,
    goToPage,
    reload: load,
    isLoading,
    error,
  };
};
