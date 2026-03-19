/**
 * @file useFetchEnvironmentExtensions.tsx
 * @function useFetchEnvironmentExtensions
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import { useState, useCallback, useRef } from 'react';
import {
  Environment,
  EnvironmentExtensions,
} from '@boomi/embedkit-sdk';
import type { EnvExtMinimal } from '../../types/ui';
import { useEnvironmentExtensionsService } from '../../service/environmentExtensions.service'
import logger from '../../logger.service';


/**
 * Retrieves environment extensions for the given environment(s) and integration pack instance.
 * Identifies and strips sensitive OAuth2 access token fields while separately returning
 * metadata about them.
 *
 * @return {{
 *   extensions: EnvironmentExtensions[] | null;
 *   fetchEnvironmentExtensions: (
 *     environments: Environment[],
 *     environmentId: string,
 *     integrationPackInstanceId: string
 *   ) => Promise<void>;
 *   isLoading: boolean;
 *   error: string | null;
 * }}
 *   Hook API with filtered extensions, matched token field metadata, loading/error state, and a refetch method.
 *
 * @throws {Error}
 *   If the Boomi client, integrationPackInstanceId, or required environment inputs are missing.
 */
export const useFetchEnvironmentExtensions = ({}: {} = {}) => {
  const [extensions, setExtensions] = useState<EnvExtMinimal[] | null>(null);
  const [rawExtensions, setRawExtensions] = useState<EnvironmentExtensions[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { fetchEnvironmentExtensions } = useEnvironmentExtensionsService();
  const inFlightKeyRef = useRef<string | null>(null);

  /**
   * @function fetchEnvironmentExtensions
   *
   * @description
   * Internal async function to:
   *  - Query processes for a given integration pack instance
   *  - Retrieve matching environment extensions
   *  - Identify and record any OAuth2 access token fields
   *  - Filter those sensitive fields out of the returned extension objects
   *
   * @throws {Error} If Boomi client, integrationPackInstanceId, or environments are invalid.
   */
  const fetchEnvironmentExtensionsHook = useCallback(
    async (
      environments: Environment[],
      environmentId: string,
      integrationPackInstanceId: string,
      isSingleInstall?: boolean
    ) => {
      const key = `${environmentId}:${integrationPackInstanceId}`;
      inFlightKeyRef.current = key;
      logger.debug(`Hook: fetchEnvironmentExtensions [${key}]`, {
        environments,
        environmentId,
        integrationPackInstanceId,
        isSingleInstall
      });

      try {
        // Basic validation parity with your previous hook
        if (!integrationPackInstanceId) {
          throw new Error('Code [1002] - integrationPackInstanceId is required');
        }
        if (!environmentId && !(Array.isArray(environments) && environments.length)) {
          throw new Error('Code [1003] - environmentId or environments[] required');
        }
        const single = isSingleInstall ?? false;
        if (single) {
          const msg = 'Code [1004] - Cannot edit connection details for this type of integration. ';
          setError(msg);
          throw new Error(msg);
        }

        setIsLoading(true);
        setError(null);

        const resp = await fetchEnvironmentExtensions({
          integrationPackInstanceId,
          environmentId: environmentId || undefined,
          environmentIds: !environmentId
            ? environments
                .map((e) => e.id)
                .filter((id): id is string => id !== undefined && id !== null)
            : undefined,
          isSingleInstall: single,
        });

        const raw = resp?.result ?? (resp as any)?.result ?? [];
        const combined = resp?.combined ?? (resp as any)?.combined ?? [];

        setRawExtensions(raw);
        setExtensions(combined);
      } catch (err: any) {
        const msg = err?.message ?? 'Code [1010] - Unknown error occurred';
        logger.error('Failed to fetch environment extensions:', msg);
        setError(msg);
        throw new Error(msg);
      } finally {
        setIsLoading(false);
        inFlightKeyRef.current = null;
      }
    },
    [fetchEnvironmentExtensions]
  );

  return {
    extensions,
    rawExtensions,
    fetchEnvironmentExtensions: fetchEnvironmentExtensionsHook,
    isLoading,
    error,
  };
};