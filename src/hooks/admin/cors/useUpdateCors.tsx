/**
 * @file useUpdateCors.tsx
 * @function useUpdateCors
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Updates a tenant's CORS configuration. Provides loading/error state and
 * returns the last saved config to mirror other admin mutation hooks.
 */

import { useCallback, useMemo, useState } from 'react';
import { useCorsService, type CorsConfig } from '../../../service/admin/cors.service';
import logger from '../../../logger.service';

export type UpdateCorsArgs = {
  primaryAccountId: string;
  allowedOrigins: string[];
};

export const useUpdateCors = () => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CorsConfig | null>(null);

  const { updateCorsConfig } = useCorsService();

  const updateCors = useCallback(
    async (args: UpdateCorsArgs) => {
      setIsUpdating(true);
      setError(null);
      try {
        const resp = await updateCorsConfig(args);
        setLastResult(resp);
        logger.debug('[useUpdateCors] updated config', { primaryAccountId: args.primaryAccountId });
        return resp;
      } catch (e: any) {
        const msg = e?.message || 'Failed to update CORS configuration';
        logger.error({ err: e }, '[useUpdateCors] failed');
        setError(msg);
        throw e;
      } finally {
        setIsUpdating(false);
      }
    },
    [updateCorsConfig]
  );

  return useMemo(
    () => ({
      updateCors,
      isUpdating,
      error,
      lastResult,
    }),
    [error, isUpdating, lastResult, updateCors]
  );
};
