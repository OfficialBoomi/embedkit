/**
 * @file useFetchExecutionRecords.tsx
 * @function useFetchExecutionRecords
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import type { ExecutionRecord } from '@boomi/embedkit-sdk';
import { useExecutionRecordsService } from '../../service/executionSummary.service';
import logger from '../../logger.service';

/**
 * Formats a record's execution time the same way the table displays it, so a
 * full or partial time (e.g. "2026-07-07", "14:30") can be matched by search.
 * Returns '' for missing/invalid timestamps.
 */
const formatExecutionTime = (r: ExecutionRecord): string => {
  const t = (r.executionTime ?? (r as any).recordedDate) as string | number | undefined;
  if (!t) return '';
  const d = new Date(t);
  return isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM-dd HH:mm:ss');
};

const PAGE_SIZE = 20;
// Server caps pageSize at 100, so pull the record set in chunks of this size.
const SERVER_MAX_PAGE_SIZE = 100;
// Overall cap on records pulled for a pack. Filtering/pagination are client-side;
// this is enough for this UI's last-30-days window.
const FETCH_LIMIT = 500;
const MAX_FETCH_PAGES = Math.ceil(FETCH_LIMIT / SERVER_MAX_PAGE_SIZE);

/**
 * Fetches execution records for all processes under a given integration pack
 * instance ID (`id`). Optionally filters by a search term (case-insensitive)
 * against the record `message` field. Records are sorted (oldest → newest) when
 * no search term is provided, and paginated with a fixed page size.
 *
 * @return {{
 *   records: ExecutionRecord[];
 *   isLoading: boolean;
 *   error: string | null;
 *   currentPage: number;
 *   totalPages: number;
 *   goToPage: (page: number) => void;
 *   refetch: () => void;
 * }}
 *   Hook API with current page of records, loading/error state, pagination helpers, and a refetch method.
 *
 * @throws {Error}
 *   Sets error state if Boomi client is missing or if required parameters are not provided.
 */

export const useFetchExecutionRecords = (
  id: string,
  searchTerm: string = ''
) => {
  // Full record set for the integration pack, fetched once per `id`. Filtering
  // and pagination are done client-side against this list.
  const [allRecords, setAllRecords] = useState<ExecutionRecord[]>([]);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [reloadKey, setReloadKey]   = useState<number>(0);

  const { getExecutionRecords } = useExecutionRecordsService();

  /**
   * @function fetchAll
   *
   * @description
   * Loads the execution records for the integration pack instance by paging the
   * server in chunks of SERVER_MAX_PAGE_SIZE (up to FETCH_LIMIT total). Search
   * filtering and pagination are applied client-side, so no search term is sent
   * to the server. `isCancelled` lets an unmount / pack switch drop stale results.
   *
   * @returns {Promise<void>} Resolves when state has been updated.
   */
  const fetchAll = useCallback(async (isCancelled: () => boolean = () => false) => {
    if (!id) {
      setError('Code [2002] - id is required.');
      setAllRecords([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const acc: ExecutionRecord[] = [];
      let total = 0;

      for (let page = 1; page <= MAX_FETCH_PAGES; page++) {
        const resp = await getExecutionRecords({
          integrationPackInstanceId: id,
          page,
          pageSize: SERVER_MAX_PAGE_SIZE,
        });
        if (isCancelled()) return;

        const items = (resp?.result ?? []) as ExecutionRecord[];
        acc.push(...items);
        total = resp?.numberOfResults ?? acc.length;

        const totalPages = resp?.totalPages ?? 1;
        if (items.length < SERVER_MAX_PAGE_SIZE || page >= totalPages) break;
      }

      if (isCancelled()) return;
      setAllRecords(acc);

      if (total > acc.length) {
        logger.warn(
          { id, fetched: acc.length, total },
          `[useFetchExecutionRecords] results capped at ${FETCH_LIMIT}; showing the most recent ${acc.length} of ${total}`
        );
      }
    } catch (e: any) {
      if (isCancelled()) return;
      const msg = e?.message || 'Failed to load execution records';
      logger.error({ err: e }, '[useFetchExecutionRecords] fetch failed');
      setError(msg);
      setAllRecords([]);
    } finally {
      if (!isCancelled()) setIsLoading(false);
    }
  }, [id, getExecutionRecords]);

  useEffect(() => {
    let cancelled = false;
    void fetchAll(() => cancelled);
    return () => { cancelled = true; };
  }, [fetchAll, reloadKey]);

  // Reset to the first page whenever the search term or pack changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, id]);

  // Precompute a lowercased searchable string per record (message, status, and
  // the displayed execution time) so filtering doesn't reformat on every keystroke.
  const searchIndex = useMemo(
    () => allRecords.map((r) => ({
      record: r,
      haystack: [
        r.message ?? '',
        r.status ?? '',
        formatExecutionTime(r),
      ].join(' ').toLowerCase(),
    })),
    [allRecords]
  );

  // Client-side, case-insensitive filter over message, status, and execution time.
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return allRecords;
    return searchIndex.filter((e) => e.haystack.includes(q)).map((e) => e.record);
  }, [allRecords, searchIndex, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const records = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);

  const refetch = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  return useMemo(() => ({
    records,
    isLoading,
    error,
    currentPage: safePage,
    totalPages,
    goToPage,
    refetch,
  }), [records, isLoading, error, safePage, totalPages, goToPage, refetch]);
};