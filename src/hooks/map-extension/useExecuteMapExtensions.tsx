/**
 * @file useUpdateMapExtensions.tsx
 * @function useUpdateMapExtensions
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import { useState, useCallback } from 'react';
import {  
  BrowseCandidate,
  EnvironmentMapExtension
 } from '@boomi/embedkit-sdk';
 import {  
  BrowseSessionStore,
  TTL_MS,
 } from '../../utils/browseSessionStore';
 import { useMapExtensionsService } from '../../service/mapExtensions.service';
import logger from '../../logger.service';


/**
  * Provides an imperative `executeMapExtensions` function that processes
 *
 * @throws {Error}
 *   If required inputs are missing or the update request fails.
 */
export const useExecuteMapExtensions = () => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [extensions, setExtensions] = useState<EnvironmentMapExtension[]>([]);
  const [updatedCandidates, setUpdatedCandidates] = useState<BrowseCandidate[]>([]);
  const { dynamicBrowseMapExtensions } = useMapExtensionsService();

  /**
   * @function executeMapExtensions
   *
   * @description
   * Updates a single `EnvironmentMapExtension` by ID using the plugin HTTP helper.
   * Attempts to parse JSON responses directly, and will best-effort parse XML if needed.
   *
   * @param {BrowseCandidate} candidates - The candidates with browse session data to execute.
   * @returns {Promise<EnvironmentMapExtension>} Resolves with the updated extension.
   *
   * @throws {Error} If the extension is missing an ID or if the HTTP request fails.
   */
  const executeMapExtensions = useCallback(
    async (candidates: BrowseCandidate[]) => {
      if (!candidates || candidates.length === 0) {
        const msg = 'Code [4002] - executeMapExtensions must have candidates.';
        logger.error(msg);
        setExecuteError(msg);
        throw new Error(msg);
      }

      try {
        setIsExecuting(true);
        setExecuteError(null);

        const response = await dynamicBrowseMapExtensions({candidates});
        const failedCandidates = response.failedCandidates || [];
        const successfulCandidates = response.successCandidates || [];
        setUpdatedCandidates(failedCandidates);

        // if success we need to store in the browse session store
        if (successfulCandidates.length > 0) {
          successfulCandidates.forEach((c) => {
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

        // log the failed candidates and return
        if (failedCandidates.length > 0) {
          const msg = `Code [4003] - Failed to execute map extensions for ${failedCandidates.length} candidate(s).`;
          logger.error(msg, failedCandidates);
          setExecuteError(msg);
          return failedCandidates;
        }


        return [];
      } catch (err: any) {
        const message = err?.message || 'Unknown error';
        logger.error('Failed to update MapExtension:', message);
        setExecuteError(message);
        throw new Error(message);
      } finally {
        setIsExecuting(false);
      }
    },[]
  );

  return {
    executeMapExtensions,
    extensions,
    isExecuting,
    executeError,
    updatedCandidates,
  };
};
