/**
 * @file useCreateIntegrationPackInstance.tsx
 * @function useCreateIntegrationPackInstance
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import { useState, useCallback } from 'react';
import { useIntegrationPacksService } from '../../service/integrationPacks.service';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import logger from '../../logger.service';

/**
 * Provides an imperative `createInstance` function that:
 *  1) Creates a new Integration Pack Instance.
 *  2) Optionally attaches the provided environments to that instance.
 *  3) Builds a convenient `IntegrationPack` config object for UI consumption.
 *
 * @return {{
 *   integrationPackConfig: IntegrationPack | null;
 *   environmentsAttached: Environment[];
 *   isLoading: boolean;
 *   error: string | null;
 *   createInstance: (
 *     integrationPackId: string,
 *     isSingleInstall?: boolean,
 *     integrationPackOverrideName?: string,
 *     environments?: Environment[]
 *   ) => Promise<IntegrationPack | undefined>;
 * }}
 *   Hook API including the latest config, attached environments, loading/error state, and the creator function.
 *
 * @throws {Error}
 *   When the Boomi client/context is missing, required inputs are invalid,
 *   or the create/attach operations fail.
 */
export const useCreateIntegrationPackInstance = () => {
  const [integrationPackConfig, setIntegrationPackConfig] = useState<IntegrationPackInstance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NEW: call server route via client service
  const { createIntegrationPack } = useIntegrationPacksService();

  /**
   * @function createInstance
   *
   * @description
   * Creates a new Integration Pack Instance and (optionally) attaches environments to it.
   * Returns a derived `IntegrationPack` config suitable for UI usage.
   *
   * @returns {Promise<IntegrationPack | undefined>} The derived IntegrationPack config if successful.
   *
   * @throws {Error} If required context is missing, inputs are invalid, or API calls fail.
   */
  const createInstance = useCallback(
    async (
      /** The base Integration Pack definition ID. */
      integrationPackId: string,

      /** Whether this is a single-environment installation. */
      isSingleInstall: boolean = false,

      /**  Environment id to install this iPack into..*/
      environmentId: string,

      /** Optional UI-facing override name. */
      integrationPackOverrideName?: string,
      
    ): Promise<IntegrationPackInstance | undefined> => {
      setIsLoading(true);
      setError(null);

      try {
        // Keep previous validations/codes for compatibility with callers & logs
        if (!environmentId) {
          throw new Error('Code [2002] - An environment ID is required to create an Integration Pack Instance.');
        }
        if (!integrationPackId) {
          throw new Error('Code [2001] - integrationPackId is required.');
        }

        // Delegate the actual creation/attachment/enrichment to the server
        logger.debug('Creating Integration Pack Instance via service', {
          integrationPackId,
          isSingleInstall,
          environmentId,
          integrationPackOverrideName,
        });

        const created = await createIntegrationPack({
          integrationPackId,
          isSingleInstall,
          environmentId,
          // server ignores override when SINGLE
          integrationPackOverrideName,
        });

        // `created` is already the enriched IntegrationPack shape 
        setIntegrationPackConfig(created);
        return created;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Code [1010] - Unknown error occurred';
        logger.error(message, err);
        setError(message);
        return undefined;
      } finally {
        setIsLoading(false);
      }
    },
    [createIntegrationPack]
  );

  return {
    integrationPackConfig,
    isLoading,
    error,
    createInstance,
  };
};