/**
 * @file useRunAllProcesses.tsx
 * @function useRunAllProcesses
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import { useState, useCallback } from 'react';

import { useProcessService } from '../../service/process.service';
import logger from '../../logger.service';

/**
 * @description
 * Provides a `runAllProcesses` function to:
 *  1. Retrieve all Atoms for the given environment.
 *  2. Retrieve all processes for the given integration pack instance.
 *  3. Trigger execution requests for every process/atom combination.
 *  4. Return the execution record URLs for tracking.
 *
 * @return {{
 *   isRunning: boolean;
 *   recordUrls: string[];
 *   error: string | null;
 *   runAllProcesses: (params: UseRunAllProcessesParams) => Promise<string[] | void>;
 * }}
 *   Hook API containing loading state, execution URLs, errors, and the execution function.
 *
 * @throws {Error}
 *   If Boomi is not initialized or required parameters are missing.
 */
export const useRunAllProcesses = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [recordUrls, setRecordUrls] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { runAllProcesses: runProcesses } = useProcessService();

  /**
   * Triggers execution of all processes in an integration pack instance across all
   * Atoms attached to the given environment.
   *
   * @returns {Promise<string[] | void>} An array of execution record URLs for tracking, or void if no executions occurred.
   *
   * @throws {Error} If Boomi client is missing, required parameters are missing, or execution requests fail.
   */
  const runAllProcesses = useCallback(async (
    /** The environment ID whose Atoms should be targeted. */
    environmentId: string, 
    
    /** The integration pack instance whose processes should be run. */
    integrationPackInstanceId: string
  ) => {
      logger.debug('useRunAllProcesses called with:', {
        environmentId,
        integrationPackInstanceId,
      });

      setIsRunning(true);
      setRecordUrls([]);
      setError(null);

      if (!environmentId || !integrationPackInstanceId) {
        const msg =
          'Code [3002] - environmentId and integrationPackInstanceId are required.';
        logger.error(msg);
        setError(msg);
        setIsRunning(false);
        throw new Error(msg);
      }

      try {
        const urls = await runProcesses({
          integrationPackInstanceId,
          environmentId,
        });
        logger.debug('Results from execution request:', urls);
        setRecordUrls(urls);
        return urls;
      } catch (err: any) {
        const msg = `Unexpected error during execution: ${
          err.message || 'Unknown error'
        }`;
        logger.error(msg);
        setError(msg);
      } finally {
        setIsRunning(false);
      }
    },
    [runProcesses]
  );

  return {
    isRunning,
    recordUrls,
    error,
    runAllProcesses,
  };
};
