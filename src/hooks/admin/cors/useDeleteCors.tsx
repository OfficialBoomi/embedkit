/**
 * @file useDeleteCors.tsx
 * @function useDeleteCors
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Deletes a tenant's CORS configuration. Tracks loading/error state so UI
 * flows can match other admin mutation hooks.
 */

import { useCallback, useMemo, useState } from 'react';
import { useCorsService } from '../../../service/admin/cors.service';
import logger from '../../../logger.service';

export type DeleteCorsArgs = {
  primaryAccountId: string;
};

export const useDeleteCors = () => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { deleteCorsConfig } = useCorsService();

  const deleteCors = useCallback(
    async (args: DeleteCorsArgs) => {
      setIsDeleting(true);
      setError(null);
      try {
        await deleteCorsConfig(args);
        logger.debug('[useDeleteCors] deleted config', { primaryAccountId: args.primaryAccountId });
      } catch (e: any) {
        const msg = e?.message || 'Failed to delete CORS configuration';
        logger.error({ err: e }, '[useDeleteCors] failed');
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
      deleteCors,
      isDeleting,
      error,
    }),
    [deleteCors, error, isDeleting]
  );
};
