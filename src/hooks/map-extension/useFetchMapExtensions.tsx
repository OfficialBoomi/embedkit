/**
 * @file useFetchMapExtensions.tsx
 * @function useFetchMapExtensions
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import { useState, useCallback} from 'react';
import {
  EnvironmentMapExtension,
  BrowseCandidate,
  EnvironmentMapExtensionCandidate
} from '@boomi/embedkit-sdk';
import {  
  BrowseSessionStore, 
 } from '../../utils/browseSessionStore';
import { useMapExtensionsService } from '../../service/mapExtensions.service';
import logger from '../../logger.service';

/**
 * Fetches map extension summaries (and, unless `breakOnSummary` is true, the full
 * map extensions) for a given Integration Pack Instance ID. Results are de-duplicated
 * across environments and processes.
 *
 * @return {{
 *   maps: EnvironmentMapExtension[],
 *   hasMaps: boolean,
 *   fetchMapExtensions: () => Promise<void>,
 *   isLoading: boolean,
 *   error: string | null
 * }}
 *   Hook API including fetched maps (when not short-circuited), a boolean indicating if any maps exist,
 *   a refetch method, and request state flags.
 *
 * @throws {Error}
 *   Sets error state if the Boomi client is missing or if required parameters are invalid.
 */
export const useFetchMapExtensions = () => {
  const [maps, setMaps] = useState<EnvironmentMapExtension[]>([]);
  const [mapCandidates, setMapCandidates] = useState<BrowseCandidate[]>([]);
  const [hasCandidates, setHasCandidates] = useState<boolean>(false);
  const [hasMaps, setHasMaps] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { getMapExtensions } = useMapExtensionsService();

  /**
   * @function fetchMapExtensions
   *
   * @description
   * Orchestrates environment attachment lookup, process listing, summary fetch,
   * and (optionally) full map extension fetching, with de-duplication.
   *
   * @returns {Promise<void>} Resolves when state has been updated.
   */
  const fetchMapExtensions = useCallback(async (
    /** Integration Pack Instance ID to query against. */
    integrationPackInstanceId: string,
      /** Environment Id to query against. */
    environmentId: string,
  ) => {
    setIsLoading(true);
    setError(null);

    logger.debug('fetchMapExtensions called', { integrationPackInstanceId, environmentId });

    // FIX: validate both are present
    if (!integrationPackInstanceId || !environmentId) {
      const msg = 'Code [2001] - Missing integrationPackInstanceId or environmentId.';
      logger.error(msg);
      setError(msg);
      setIsLoading(false);
      return;
    }

    try {
      // fetch all map extensions for the given IPP & environment
      const allMaps = await getMapExtensions({ integrationPackInstanceId, environmentId });

      // patch & prune without mutating
      const normalized = BrowseSessionStore.attachSessionsAndPrune(allMaps);

      // derive UI state
      setHasMaps(normalized.length > 0);
      const flatCandidates = normalized.flatMap(m => m.candidates ?? []);
      setHasCandidates(flatCandidates.length > 0);
      setMapCandidates(flatCandidates);
      setMaps(normalized.map(m => m.map));
    } catch (err: any) {
      const message =
        err?.response?.data?.message ??
        err?.message ??
        'Code [2004] - Unknown error fetching maps';
      logger.error('Failed to fetch maps:', message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [getMapExtensions]);

  return { maps, hasMaps, hasCandidates, mapCandidates, fetchMapExtensions, isLoading, error };
};