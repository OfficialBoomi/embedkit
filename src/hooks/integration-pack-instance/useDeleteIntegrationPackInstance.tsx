/**
 * @file useDeleteIntegrationPackInstance.tsx
 * @function useDeleteIntegrationPackInstance
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import { useState } from 'react';
import { useIntegrationPacksService } from '../../service/integrationPacks.service';
import logger from '../../logger.service';

/**
 * Provides an imperative `deleteIntegrationPackInstance` function that removes
 * an integration pack instance by ID.
 *
 * @return {{
 *   deleteIntegrationPackInstance: (integrationPackInstanceId: string) => Promise<boolean>;
 *   isLoading: boolean;
 *   error: string | null;
 * }}
 *   Hook API with the delete function and request state.
 *
 * @throws {Error}
 *   If the Boomi client or required context is missing, or if the ID is not provided.
 */
export const useDeleteIntegrationPackInstance = () => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { deleteIntegrationPackInst } = useIntegrationPacksService();

  /**
   * @function deleteIntegrationPackInstance
   *
   * @description
   * Deletes the specified Integration Pack Instance.
   *
   * @returns {Promise<boolean>} Resolves `true` on success, `false` on failure.
   *
   * @throws {Error} When Boomi/context is not initialized or the ID is missing.
   */
  const deleteIntegrationPackInstanceHook = async (integrationPackInstanceId: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    if (!integrationPackInstanceId) {
      const msg = 'Code [1002] - integrationPackInstanceId was not provided.';
      logger.error(msg);
      setIsLoading(false);
      setError(msg);
      return false;
    }

    try {
      await deleteIntegrationPackInst(integrationPackInstanceId);
      logger.debug('Deleted Integration Pack Instance with ID:', integrationPackInstanceId);
      return true;
    } catch (err) {
      const msg = (err as Error)?.message ?? 'Code [1010] - Unknown error occurred';
      logger.error('Failed to delete Integration Pack Instance', err);
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return { deleteIntegrationPackInstance: deleteIntegrationPackInstanceHook, isLoading, error };
};