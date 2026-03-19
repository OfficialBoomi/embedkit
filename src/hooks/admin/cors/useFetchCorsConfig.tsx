/**
 * @file useFetchCorsConfig.tsx
 * @function useFetchCorsConfig
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Fetches a single tenant's CORS configuration by primaryAccountId.
 * Mirrors the integration-pack-instance fetch pattern (loading/error/refetch).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCorsService, type CorsConfig } from '../../../service/admin/cors.service';
import logger from '../../../logger.service';

export type UseFetchCorsConfigArgs = {
  primaryAccountId?: string;
  auto?: boolean;
};

export const useFetchCorsConfig = ({ primaryAccountId, auto = true }: UseFetchCorsConfigArgs) => {
  const [corsConfig, setCorsConfig] = useState<CorsConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);
  const lastKeyRef = useRef<string | null>(null);

  const { getCorsConfig } = useCorsService();

  const fetchConfig = useCallback(async () => {
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
      logger.debug('[useFetchCorsConfig] fetched config', resp);
    } catch (e: any) {
      const msg = e?.message || 'Failed to load CORS configuration';
      logger.error({ err: e }, '[useFetchCorsConfig] fetch failed');
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
    void fetchConfig();
  }, [auto, fetchConfig, primaryAccountId]);

  // Reload when ID changes
  useEffect(() => {
    if (!auto || !hasFetchedRef.current) return;
    const key = primaryAccountId ?? '';
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    void fetchConfig();
  }, [auto, fetchConfig, primaryAccountId]);

  return useMemo(
    () => ({
      corsConfig,
      allowedOrigins: corsConfig?.allowedOrigins ?? [],
      refetch: fetchConfig,
      isLoading,
      error,
    }),
    [corsConfig, fetchConfig, isLoading, error]
  );
};
