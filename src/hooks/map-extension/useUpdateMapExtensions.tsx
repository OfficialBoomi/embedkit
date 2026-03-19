/**
 * @file useUpdateMapExtensions.tsx
 * @function useUpdateMapExtensions
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import { useState, useCallback } from 'react';
import { EnvironmentMapExtension } from '@boomi/embedkit-sdk';
import { useMapExtensionsService } from '../../service/mapExtensions.service';
import {  
  BrowseSessionStore, 
 } from '../../utils/browseSessionStore';
import logger from '../../logger.service';

/**
 * Provides an imperative `updateMapExtensions` function that posts a single
 * `EnvironmentMapExtension` update. Accepts JSON payloads and handles either JSON
 * or XML responses from Boomi.
 *
 * @return {{
 *   updateMapExtensions: (params: UseUpdateMapExtensionsUpdateParams) => Promise<EnvironmentMapExtension>,
 *   isUpdating: boolean,
 *   updateError: string | null,
 *   updatedExtensions: EnvironmentMapExtension[]
 * }}
 *   Hook API exposing the updater function, loading/error state, and last updated extensions.
 *
 * @throws {Error}
 *   If required inputs are missing or the update request fails.
 */
export const useUpdateMapExtensions = () => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updatedExtensions, setUpdatedExtensions] = useState<EnvironmentMapExtension[]>([]);
  const { updateMapExtension } = useMapExtensionsService();

  /**
   * @function updateMapExtensions
   *
   * @description
   * Updates a single `EnvironmentMapExtension` by ID using the plugin HTTP helper.
   * Attempts to parse JSON responses directly, and will best-effort parse XML if needed.
   *
   * @param {EnvironmentMapExtension} envMapExtension - The extension object to update (must include `id`).
   * @returns {Promise<EnvironmentMapExtension>} Resolves with the updated extension.
   *
   * @throws {Error} If the extension is missing an ID or if the HTTP request fails.
   */
  const updateMapExtensions = useCallback(
    async (envMapExtension: EnvironmentMapExtension): Promise<EnvironmentMapExtension> => {
      const id = envMapExtension.id;
      if (!id) {
        const msg = 'Code [4002] - EnvironmentMapExtension must have an ID.';
        logger.error(msg);
        setUpdateError(msg);
        throw new Error(msg);
      }

      try {
        setIsUpdating(true);
        setUpdateError(null);
        setUpdatedExtensions([]);

        logger.debug('Executing MapExtension update via httpPost:', envMapExtension);
        const patched = BrowseSessionStore.patchExtensionWithSessions(envMapExtension);
        logger.debug("patched:", patched);

        const updated = await updateMapExtension(patched);

        setUpdatedExtensions([updated]);
        logger.debug('MapExtension updated successfully:', updated);

        return updated;
      } catch (err: any) {
        const message = err?.message || 'Unknown error';
        logger.error('Failed to update MapExtension:', message);
        setUpdateError(message);
        throw new Error(message);
      } finally {
        setIsUpdating(false);
      }
    },
    []
  );

  return {
    updateMapExtensions,
    isUpdating,
    updateError,
    updatedExtensions,
  };
};
