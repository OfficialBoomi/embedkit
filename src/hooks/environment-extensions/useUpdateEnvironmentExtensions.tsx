/**
 * @file useUpdateEnvironmentExtensions.tsx
 * @function useUpdateEnvironmentExtensions
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */
import { useState, useCallback, useRef } from 'react';
import type { 
  UpdateResult,
  EnvironmentExtensions,
  EnvExtMinimal
} from '@boomi/embedkit-sdk';
 import {  
  BrowseSessionStore,
  TTL_MS,
 } from '../../utils/browseSessionStore';
import { updateEditedWithErrors } from './environmentExtensionsService';
import { useEnvironmentExtensionsService } from '../../service/environmentExtensions.service';
import { useMapExtensionsService } from '../../service/mapExtensions.service';
import logger from '../../logger.service';
import { set } from 'date-fns';

/**
 * Provides an imperative `updateEnvironmentExtensions` function to update a single
 * environment extension record. Sets `partial=true` prior to update to indicate a
 * partial update. Updates plugin config after completion.
 *
 * @return {{
 *   updateEnvironmentExtensions: (
 *     extension: EnvironmentExtensions,
 *     environmentId: string,
 *     extensionGroupId: string
 *   ) => Promise<void>;
 *   isUpdating: boolean;
 *   updateError: string | null;
 *   updatedExtension: EnvironmentExtensions | null;
 * }}
 *   Hook API exposing the update function and request state.
 *
 * @throws {Error}
 *   If required inputs are missing or the update call fails.
 */
export const useUpdateEnvironmentExtensions = () => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [editedConnections, setEditedConnections] = useState<EnvExtMinimal[] | null>(null);
  const [updatedExtension, setUpdatedExtension] = useState<EnvironmentExtensions | null>(null);
  const lastSubmittedEditsRef = useRef<EnvExtMinimal[] | null>(null);
  const { updateEnvironmentExtensions} = useEnvironmentExtensionsService();
  const { mapFunctionBrowse } = useMapExtensionsService();


  /**
   * @function updateEnvironmentExtensions
   *
   * @description
   * Updates a single `EnvironmentExtensions` record. The `extensionGroupId` parameter
   * is currently accepted for parity with query flows, but is not used by this update call.
   *
   * @returns {Promise<void>} Resolves when the update completes and state is set.
   *
   * @throws {Error} When the Boomi client or required parameters are missing, or when the API call fails.
   */
  const updateFromCombined = useCallback(
    async (
      originals: EnvironmentExtensions[],
      combinedEdited: EnvExtMinimal[],
      environmentId: string, 
      integrationPackInstanceId: string,
      isSingleInstall?: boolean
    ): Promise<UpdateResult> => {
      logger.debug('Starting batch update from combined edits:', { originals: originals.length, edited: combinedEdited.length });
      if (!environmentId || !integrationPackInstanceId) {
        const msg = 'Code [3002] - environmentId and integrationPackInstanceId are required for update.';
        logger.error(msg);
        setUpdateError(msg);
        throw new Error(msg);
      }
      
      lastSubmittedEditsRef.current = combinedEdited;
      setIsUpdating(true);
      setUpdateError(null);

      try {
        const result = await updateEnvironmentExtensions(
          {
            originals: originals as EnvironmentExtensions[],
            combinedEdited: combinedEdited as EnvExtMinimal[],
          }
        );
        logger.debug('Batch update completed:', result.updatedExtensions);

        if (!isSingleInstall){
          // now the function browse to refresh candidates for the updated extensions
          const resp = await mapFunctionBrowse({
            originals: originals,
            updated: combinedEdited,
            integrationPackInstanceId,
            environmentId,
          });
          logger.debug('Map function browse response:', resp);
          const failedCandidates = resp.failedCandidates || [];
          const successfulCandidates = resp.successCandidates || [];

          // if success we need to store in the browse session store
          if (successfulCandidates.length > 0) {
            successfulCandidates.forEach((c) => {
              logger.debug('Storing successful Dynamic Browsing candidate in BrowseSessionStore:', c);
              BrowseSessionStore.upsert({
                containerId: c.containerId,
                connectionId: c.connectionId,
                connectionName: c.connectionName,
                paramName: c.paramName,
                sessionId: c.sessionId,                             
                ttlMs: TTL_MS,
                mapId: c.mapId,
                processId: c.processId,
                environmentId: c.environmentId,
                candidateSource: c.candidateSource,
              });
            });
          }

          if (failedCandidates && failedCandidates.length > 0) {
            logger.warn('Some Dynamic Browsing candidates failed to authenticate:', resp.failedCandidates);
            const baseEdits = lastSubmittedEditsRef.current ?? [];
            const errorPatchedConnections = await updateEditedWithErrors(resp, baseEdits);
            setEditedConnections(errorPatchedConnections);

            const message =
              'You must provide valid connection credentials to proceed.';
            logger.error('Failed to authenticate Dynamic Browsing endpoints.');
            setUpdateError(message);
            throw new Error(message);
          } 
          logger.debug('Map function browse completed:', resp);
        } else {
          setEditedConnections(combinedEdited);
        }

        return result;
      } catch (err: any) {
        const message = err?.message ?? 'Unknown batch update error';
        setUpdateError(message);
        logger.error('Batch update failed:', message);
        throw err;
      } finally {
        setIsUpdating(false);
      }
    },[]
  );

  return {
    updateFromCombined,
    isUpdating,
    updateError,
    editedConnections,
    updatedExtension,
  };
};
