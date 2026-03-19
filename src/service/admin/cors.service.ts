import { useCallback, useMemo } from 'react';
import { useHttp } from '../http';
import logger from '../../logger.service';

export type CorsConfig = {
  primaryAccountId: string;
  allowedOrigins: string[];
};

export type GetCorsConfigArgs = {
  primaryAccountId: string;
  signal?: AbortSignal;
};

export type UpsertCorsConfigArgs = {
  primaryAccountId: string;
  allowedOrigins: string[];
  signal?: AbortSignal;
};

export type DeleteCorsConfigArgs = {
  primaryAccountId: string;
  signal?: AbortSignal;
};

export function useCorsService() {
  const http = useHttp();

  const path = useCallback((id: string) => {
    return `/admin/cors/${encodeURIComponent(id)}`;
  }, []);

  const getCorsConfig = useCallback(async (args: GetCorsConfigArgs): Promise<CorsConfig> => {
    const { primaryAccountId, signal } = args;
    logger.debug('[useCorsService.getCorsConfig]', { primaryAccountId });
    return http.get(path(primaryAccountId), { signal });
  }, [http, path]);

  const createCorsConfig = useCallback(async (args: UpsertCorsConfigArgs): Promise<CorsConfig> => {
    const { primaryAccountId, allowedOrigins, signal } = args;
    logger.debug('[useCorsService.createCorsConfig]', { primaryAccountId, count: allowedOrigins.length });
    return http.post(path(primaryAccountId), { allowedOrigins }, { signal });
  }, [http, path]);

  const updateCorsConfig = useCallback(async (args: UpsertCorsConfigArgs): Promise<CorsConfig> => {
    const { primaryAccountId, allowedOrigins, signal } = args;
    logger.debug('[useCorsService.updateCorsConfig]', { primaryAccountId, count: allowedOrigins.length });
    return http.put(path(primaryAccountId), { allowedOrigins }, { signal });
  }, [http, path]);

  const deleteCorsConfig = useCallback(async (args: DeleteCorsConfigArgs): Promise<void> => {
    const { primaryAccountId, signal } = args;
    logger.debug('[useCorsService.deleteCorsConfig]', { primaryAccountId });
    await http.del(path(primaryAccountId), { signal });
  }, [http, path]);

  return useMemo(() => ({
    getCorsConfig,
    createCorsConfig,
    updateCorsConfig,
    deleteCorsConfig,
  }), [getCorsConfig, createCorsConfig, updateCorsConfig, deleteCorsConfig]);
}
