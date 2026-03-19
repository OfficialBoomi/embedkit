/**
 * @file useCorsMutations.tsx
 * @function useCorsMutations
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Provides create/update/delete helpers for tenant CORS settings using the
 * admin CORS service. Matches the loading/error ergonomics used across other
 * admin hooks so UI flows stay consistent.
 */

import { useCallback, useMemo, useState } from 'react';
import { useCorsService, type CorsConfig } from '../../../service/admin/cors.service';
import logger from '../../../logger.service';

export type SaveCorsArgs = {
  primaryAccountId: string;
  allowedOrigins: string[];
};

export type DeleteCorsArgs = {
  primaryAccountId: string;
};

export const useCorsMutations = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CorsConfig | null>(null);

  const { createCorsConfig, updateCorsConfig, deleteCorsConfig } = useCorsService();

  const saveCors = useCallback(
    async (args: SaveCorsArgs, mode: 'create' | 'update' = 'update') => {
      setIsSaving(true);
      setError(null);
      try {
        const op = mode === 'create' ? createCorsConfig : updateCorsConfig;
        const resp = await op(args);
        setLastResult(resp);
        logger.debug('[useCorsMutations.saveCors]', { primaryAccountId: args.primaryAccountId, mode });
        return resp;
      } catch (e: any) {
        const msg = e?.message || 'Failed to save CORS configuration';
        logger.error({ err: e }, '[useCorsMutations.saveCors] failed');
        setError(msg);
        throw e;
      } finally {
        setIsSaving(false);
      }
    },
    [createCorsConfig, updateCorsConfig]
  );

  const deleteCors = useCallback(
    async (args: DeleteCorsArgs) => {
      setIsDeleting(true);
      setError(null);
      try {
        await deleteCorsConfig(args);
        setLastResult(null);
        logger.debug('[useCorsMutations.deleteCors]', { primaryAccountId: args.primaryAccountId });
      } catch (e: any) {
        const msg = e?.message || 'Failed to delete CORS configuration';
        logger.error({ err: e }, '[useCorsMutations.deleteCors] failed');
        setError(msg);
        throw e;
      } finally {
        setIsDeleting(false);
      }
    },
    [deleteCorsConfig]
  );

  return useMemo(
    () => ({
      saveCors,
      deleteCors,
      isSaving,
      isDeleting,
      error,
      lastResult,
    }),
    [deleteCors, error, isDeleting, isSaving, lastResult, saveCors]
  );
};
