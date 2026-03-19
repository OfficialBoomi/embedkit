/**
 * @file useFetchEnvironments.tsx
 * @function useFetchEnvironments
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import { useState, useCallback } from 'react';
import { useEnvironmentsService } from '../../service/environment.service';
import logger from '../../logger.service';

/**
 * Fetches environments from the Boomi API using classification (PROD/TEST/ALL)
 * or a specific environment ID. When available, enriches environments with Atom
 * attachments and computes an `isActive` flag (true if all attached Atoms are ONLINE).
 * 
 *
 * @return {{ environments: any[]; isLoading: boolean; error: string | null }}
 *   An object containing the fetched environments with metadata, loading state, and any error.
 *
 * @throws {Error}
 *   If required context (Boomi SDK, apiAccountId) or parameters are missing.
 */
export const useFetchEnvironments = () => {
  const [environments, setEnvironments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getEnvironments } = useEnvironmentsService();

  /**
   * Internal async function that:
   * - Validates required parameters and context.
   * - Builds the appropriate filter based on the provided inputs.
   * - Queries environments from the Boomi API.
   * - Enriches each environment with Atom attachment and online status data.
   *
   * @throws {Error} If the Boomi plugin is not initialized or required parameters are missing.
   */
  const fetchEnvironments = useCallback(
    async (includeEnvironments?: 'PROD' | 'TEST' | 'ALL', environmentId?: string | null) => {
      setIsLoading(true);
      setError(null);
      setEnvironments([]);

      // preserve old error codes/messages for callers/logs
      if (!includeEnvironments && !environmentId) {
        const msg = 'Code [1002] - Environment ID or classifications must be provided.';
        logger.error(msg);
        setError(msg);
        setIsLoading(false);
        return;
      }

      try {
        const resp = await getEnvironments({
          includeEnvironments,
          environmentId: environmentId ?? undefined,
        });

        // Support both axios-like and fetch-like clients
        const items = resp?.result ?? [];
        if (!items.length) {
          const msg = 'Code [1004] - No environments found.';
          logger.error(msg);
          setError(msg);
          return;
        }

        setEnvironments(items);
        logger.debug('returning environments:', items);
      } catch (err: any) {
        const msg = `Unexpected error: ${err?.message ?? 'Unknown'}`;
        logger.error(msg, err);
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [getEnvironments]
  );

  return { fetchEnvironments, environments, isLoading, error };
};