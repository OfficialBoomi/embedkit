/**
 * @file useFetchProcessSchedules.tsx
 * @function useFetchProcessSchedules
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */
import { useState, useCallback } from 'react';
import {
  ProcessSchedules,
} from '@boomi/embedkit-sdk';
import { useProcessSchedulesService } from '../../service/processSchedules.service';
import logger from '../../logger.service';


/**
 * Provides a method to fetch process schedules for a given environment and
 * integration pack instance. Looks up atom attachments, queries processes, and
 * then queries schedules per (atomId, processId) pair until one is found.
 *
 * @return {{
 *   schedule: ProcessSchedules | null;
 *   processes: Process[];
 *   isLoading: boolean;
 *   error: string | null;
 *   fetchSchedules: (params: UseFetchProcessSchedulesParams) => Promise<void>;
 * }}
 *   Hook state and API.
 *
 * @throws {Error}
 *   If required params are missing or queries fail.
 */
export const useFetchProcessSchedules = () => {
  const [schedule, setSchedule] = useState<ProcessSchedules | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getProcessSchedules } = useProcessSchedulesService ();

  /**
   * @function fetchSchedules
   *
   * @description
   * Queries Boomi for atom attachments, processes, and schedules matching
   * the provided `environmentId` and `integrationPackInstanceId`. Stops on the
   * first found schedule and sets it in state.
   *
   * @returns {Promise<void>}
   */
  const fetchSchedules = useCallback(async (
    /** The environment ID to search within. */
    environmentId: string, 
    
    /** The integration pack instance ID. */
    integrationPackInstanceId: string
  ) => {
      logger.debug('useFetchProcessSchedules called with:', {
        environmentId,
        integrationPackInstanceId
      });

      setIsLoading(true);
      setError(null);
      setSchedule(null);

      if (!environmentId || !integrationPackInstanceId) {
        const msg = 'Code [2002] - environmentId and integrationPackInstanceId are required.';
        logger.error(msg);
        setError(msg);
        setIsLoading(false);
        return;
      }

      try {
          const resp = await getProcessSchedules({integrationPackInstanceId, environmentId});
          if (!resp || !resp.result) {
            const msg = `No process schedules found for integrationPackInstanceId ${integrationPackInstanceId} in environment ${environmentId}`;
            logger.warn(msg);
            setError(msg);
            return;
          }
          if (resp.result[0]?.Schedule?.length) {
            setSchedule(resp.result[0]);
            return;
          }

        logger.warn('No schedules found for any processes/atoms');
      } catch (err: any) {
        const msg = `Unexpected error fetching process schedules: ${err?.message || 'Unknown error'}`;
        logger.error(msg);
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [getProcessSchedules]
  );

  return {
    schedule,
    isLoading,
    error,
    fetchSchedules
  };
};
