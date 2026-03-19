/**
 * @file useFetchExecutionRecords.tsx
 * @function useFetchExecutionRecords
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useExecutionRecordsService } from '../../service/executionSummary.service';
import logger from '../../logger.service';

const PAGE_SIZE = 20;

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
  const [records, setRecords] = useState<ReturnType<typeof useExecutionRecordsService> extends { getExecutionRecords: any }
    ? Awaited<ReturnType<ReturnType<typeof useExecutionRecordsService>['getExecutionRecords']>>['items']
    : any[]>([]);
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages]   = useState<number>(1);

  const { getExecutionRecords } = useExecutionRecordsService();

    /**
   * @function fetchRecords
   *
   * @description
   * Internal async helper that:
   *  - Validates inputs and context
   *  - Resolves processes for the given integration pack instance
   *  - Queries execution records for each process
   *  - Applies optional message filtering and default sort
   *  - Paginates the result and updates state
   *
   * @returns {Promise<void>} Resolves when state has been updated.
   */
    const fetchPage = useCallback(async (page: number = 1) => {
    if (!id) {
      setError('Code [2002] - id is required.');
      setRecords([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const resp = await getExecutionRecords({
        integrationPackInstanceId: id,
        search: searchTerm,
        page,
        pageSize: PAGE_SIZE,
      });

      setRecords(resp.result);
      setCurrentPage(resp.page || 1);
      setTotalPages(resp.totalPages || 1);
    } catch (e: any) {
      const msg = e?.message || 'Failed to load execution records';
      logger.error({ err: e }, '[useFetchExecutionRecords] fetch failed');
      setError(msg);
      setRecords([]);
      setCurrentPage(1);
      setTotalPages(1);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) {
      void fetchPage(1);
    } else {
      setRecords([]);
      setTotalPages(1);
      setCurrentPage(1);
      setError(null);
    }
  }, [id, searchTerm, fetchPage]);

  const goToPage = useCallback((page: number) => {
    if (page >= 1 && page <= totalPages) {
      void fetchPage(page);
    }
  }, [fetchPage, totalPages]);

  const refetch = useCallback(() => {
    void fetchPage(currentPage);
  }, [fetchPage, currentPage]);

  return useMemo(() => ({
    records,
    isLoading,
    error,
    currentPage,
    totalPages,
    goToPage,
    refetch,
  }), [records, isLoading, error, currentPage, totalPages, goToPage, refetch]);
};