/**
 * @file useFetchCors.tsx
 * @function useFetchCors
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Fetches the CORS configuration for a tenant (primaryAccountId) and exposes
 * a memoized API for refetching plus simple loading/error state. Mirrors the
 * integration-pack-instance hook pattern to keep admin UI usage consistent.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCorsService, type CorsConfig } from '../../../service/admin/cors.service';
import logger from '../../../logger.service';

export type UseFetchCorsArgs = {
  primaryAccountId?: string;
  /** Set false to opt-out of auto-fetch on mount/id change. */
  auto?: boolean;
};

export const useFetchCors = ({ primaryAccountId, auto = true }: UseFetchCorsArgs) => {
  const [corsConfig, setCorsConfig] = useState<CorsConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);
  const lastKeyRef = useRef<string | null>(null);

  const { getCorsConfig } = useCorsService();

  const fetchCorsConfig = useCallback(async () => {
    if (!primaryAccountId) {
      const msg = 'primaryAccountId is required to load CORS settings.';
      logger.error(msg);
      setError(msg);
      setCorsConfig(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const resp = await getCorsConfig({ primaryAccountId });
      setCorsConfig(resp);
      logger.debug('[useFetchCors] fetched config', resp);
    } catch (e: any) {
      const msg = e?.message || 'Failed to load CORS configuration';
      logger.error({ err: e }, '[useFetchCors] fetch failed');
      setError(msg);
      setCorsConfig(null);
    } finally {
      setIsLoading(false);
    }
  }, [getCorsConfig, primaryAccountId]);

  // Initial load once
  useEffect(() => {
    if (!auto || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    lastKeyRef.current = primaryAccountId ?? '';
    void fetchCorsConfig();
  }, [auto, fetchCorsConfig, primaryAccountId]);

  // Subsequent loads only when the tenant id changes
  useEffect(() => {
    if (!auto || !hasFetchedRef.current) return;
    const key = primaryAccountId ?? '';
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    void fetchCorsConfig();
  }, [auto, fetchCorsConfig, primaryAccountId]);

  return useMemo(
    () => ({
      corsConfig,
      allowedOrigins: corsConfig?.allowedOrigins ?? [],
      refetch: fetchCorsConfig,
      isLoading,
      error,
    }),
    [corsConfig, fetchCorsConfig, isLoading, error]
  );
};
