/**
 * @file useFetchEnvironmentExtensionConnectionStatus.tsx
 * @function useFetchEnvironmentExtensionConnectionStatus
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import { useState, useCallback } from 'react';
import { usePlugin } from '../../context/pluginContext';
import {
  normalizeError,
} from './environmentExtensionsService';
import { useEnvironmentExtensionsService } from '../../service/environmentExtensions.service';
import logger from '../../logger.service';

/**
 * Retrieves connection status for a specific environment extension field.
 *
 * @return {{
 *   status: boolean | null;
 *   fetchEnvironmentExtensionConnectionStatus: (
 *     environmentId: string,
 *     integrationPackInstanceId: string,
 *     connectionId: string,
 *     fieldId: string,
 *     opts?: { force?: boolean }
 *   ) => Promise<boolean>;
 *   isLoading: boolean;
 *   error: string | null;
 * }}
 */
export const useFetchEnvironmentExtensionConnectionStatus = () => {
  const [status, setStatus] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { fetchConnectionStatus } = useEnvironmentExtensionsService();
  /**
   * @function fetchEnvironmentExtensionConnectionStatus
   *
   * @description
   * Queries Boomi for a specific connection field and determines
   * whether an encrypted access token has been set.
   *
   * @returns {Promise<boolean>} - `true` if connected, `false` otherwise.
   */
  const fetchEnvironmentExtensionConnectionStatus = useCallback(
    async (
      environmentId: string,
      integrationPackInstanceId: string,
      connectionId: string,
      fieldId: string,
      opts?: { force?: boolean }
    ): Promise<boolean> => {
      logger.debug(
        'useFetchEnvironmentExtensionConnectionStatus: Fetching connection status...',
        { environmentId, integrationPackInstanceId, connectionId, fieldId }
      );

      const hasValidEnvInput = !!environmentId && !!connectionId && !!fieldId;

      try {
        setIsLoading(true);
        setError(null);

        const connected = await fetchConnectionStatus({
          integrationPackInstanceId,
          environmentId,
          connectionId,
          fieldId
        });

        setStatus(connected);
        return connected; // ✅ return boolean result directly
      } catch (err: any) {
        const message = normalizeError(err);
        logger.error('Failed to fetch environment extension connection status:', message);
        setError(message);
        setStatus(false);
        return false; // ✅ ensure boolean fallback on error
      } finally {
        setIsLoading(false);
      }
    },
    [fetchConnectionStatus]
  );

  return {
    status,
    fetchEnvironmentExtensionConnectionStatus,
    isLoading,
    error,
  };
};
