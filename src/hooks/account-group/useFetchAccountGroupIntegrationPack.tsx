/**
 * @file useFetchAccountGroupIntegrationPacks.tsx
 * @function useFetchAccountGroupIntegrationPacks
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import { useEffect, useRef, useState } from 'react';
import { usePlugin } from '../../context/pluginContext';
import { useIntegrationPacksService } from '../../service/integrationPacks.service'
import logger from '../../logger.service';

type Params = {
  filter: string;
};

/**
 * React hook that:
 *  1) Retrieves the current Boomi account group from context,
 *  2) Queries the Boomi API for associated Integration Packs,
 *  3) Filters out packs based on installation type and whether an instance already exists.
 *
 * @return {{
 *   integrationPacks: any[];
 *   isLoading: boolean;
 *   error: string | null;
 * }}
 *   Hook result containing the eligible Integration Packs for the account group, loading state, and any error.
 *
 * @throws {Error}
 *   If the Boomi SDK or required configuration values are missing.
 */
export const useFetchAccountGroupIntegrationPacks = (params: Params) => {
  const { filter } = params;
  const [integrationPacks, setIntegrationPacks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { getEligibleIntegrationPacks } = useIntegrationPacksService();
  const hasFetchedRef = useRef(false);
  const { boomiConfig } = usePlugin();

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    /**
     * @function fetchData
     * 
     * @description
     * Internal async function to:
     *  - Resolve the Account Group ID from its name.
     *  - Retrieve associated Integration Packs.
     *  - Fetch details in bulk.
     *  - Query existing instances and filter out disallowed packs.
     * 
     * @throws Will set an error state if API requests fail or required context is missing.
     */
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      setIntegrationPacks([]);

      try {
        logger.debug('Requesting eligible Integration Packs for current account group');
        const notAllowedIds = Object.entries(boomiConfig?.agents ?? {})
          .filter(([id, cfg]) => cfg.allowInstall === false)
          .map(([id]) => id);
        const resp = await getEligibleIntegrationPacks({notAllowedIds, renderType: filter});
        logger.debug('Received eligible Integration Packs:', resp?.result);
        setIntegrationPacks(resp.result || []);
      } catch (err: any) {
        const msg = `Unexpected error: ${err?.message ?? 'Unknown'}`;
        logger.error(msg, err);
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [getEligibleIntegrationPacks]);

  return { integrationPacks, isLoading, error };
};