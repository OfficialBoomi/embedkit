/**
 * @file useUpdateProcessSchedules.tsx
 * @function useUpdateProcessSchedules
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import { useState, useCallback } from 'react';
import {
  Schedule,
  ProcessSchedules,
} from '@boomi/embedkit-sdk';
import { useProcessSchedulesService } from '../../service/processSchedules.service';
import logger from '../../logger.service';


/**
 * Provides an imperative `updateProcessSchedules` function that:
 *  1) Resolves Atom IDs attached to an environment,
 *  2) Retrieves all processes for an integration pack instance,
 *  3) Constructs a `ProcessSchedules` payload (including a `Retry` policy),
 *  4) Replaces schedules for every (processId × atomId) combination.
 *
 * @return {{
 *   updateProcessSchedules: (params: UseUpdateProcessSchedulesParams) => Promise<void>;
 *   isUpdating: boolean;
 *   updateError: string | null;
 *   updatedSchedules: ProcessSchedules[];
 * }}
 *   Hook API with the updater function, request state, and the list of updated schedule objects.
 *
 * @throws {Error}
 *   If required context or parameters are missing, or if any update call fails.
 */
export const useUpdateProcessSchedules = () => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updatedSchedules, setUpdatedSchedules] = useState<ProcessSchedules[]>([]);
  const { updateProcessSchedules: updateAllProcessSchedules } = useProcessSchedulesService ();

  /**
   * @function updateProcessSchedules
   *
   * @description
   * Replaces schedules for all processes in the given integration pack instance
   * across all Atoms attached to the provided environment. Uses a fixed Retry
   * policy of `maxRetry: 5` alongside the supplied `Schedule[]`.
   *
   * @returns {Promise<void>} Resolves when all eligible schedule entries have been updated.
   *
   * @throws {Error} If Boomi client is missing, parameters are invalid, or the update fails.
   */
  const updateProcessSchedules = useCallback(async (
    /** The new schedules to apply. */
    schedules: Schedule[],

    /** Environment whose attached Atoms will be targeted. */
    environmentId: string,
    
    /** Integration pack instance whose processes will be updated. */
    integrationPackInstanceId: string
  ) => {

      if (!environmentId || !integrationPackInstanceId) {
        const msg = 'Code [3002] - environmentId and integrationPackInstanceId required';
        logger.error(msg);
        setUpdateError(msg);
        throw new Error(msg);
      }

      try {
        setIsUpdating(true);
        setUpdateError(null);
        setUpdatedSchedules([]);

        const result = await updateAllProcessSchedules({
          integrationPackInstanceId,
          environmentId,
          schedules
        });
        if (!result) {
          const msg = 'Code [3003] - No response from updateProcessSchedules';
          logger.error(msg);
          setUpdateError(msg);
          throw new Error(msg);
        }

        setUpdatedSchedules(result);
        logger.debug(`Successfully replaced schedules on ${result.length} process entries`);
      } catch (err: any) {
        const message = err.response?.data?.message || err.message || 'Unknown error';
        logger.error('Failed to update process schedules:', message);
        setUpdateError(message);
        throw new Error(message);
      } finally {
        setIsUpdating(false);
      }
    },
    [updateAllProcessSchedules]
  );

  return {
    updateProcessSchedules,
    isUpdating,
    updateError,
    updatedSchedules,
  };
};
