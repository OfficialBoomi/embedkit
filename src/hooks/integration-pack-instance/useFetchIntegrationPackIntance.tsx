/**
 * @file useFetchIntegrationPackInstance.ts
 * @function useFetchIntegrationPackInstance
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Fetches a single IntegrationPackInstance on-demand (no auto fetch).
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { useIntegrationPacksService } from '../../service/integrationPacks.service';
import logger from '../../logger.service';

type Params = {
  integrationPackId: string;
};

export function useFetchIntegrationPackInstance(params: Params) {
  const { integrationPackId } = params;

  const [instance, setInstance] = useState<IntegrationPackInstance | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const { getIntegrationPack } = useIntegrationPacksService();

  const fetchIntegrationPack = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (!integrationPackId ) {
        throw new Error('integrationPackId is required');
      }

      lastKeyRef.current = `${integrationPackId}`;

      const resp = await getIntegrationPack({
        integrationPackId
      });
      logger.debug({ resp, integrationPackId }, '[useFetchIntegrationPackInstance] fetched data');
      if (resp) {
        setInstance(resp.result && resp.result.length > 0 ? resp.result[0] : null);
      } else {
        setInstance(null);
      }
    } catch (e: any) {
      const msg = e?.message || 'Failed to load integration pack instance';
      logger.error({ err: e, integrationPackId}, '[useFetchIntegrationPackInstance] fetch failed');
      setError(msg);
      setInstance(null);
    } finally {
      setIsLoading(false);
    }
  }, [getIntegrationPack, integrationPackId]);

  return useMemo(
    () => ({
      instance,    
      isLoading,  
      error,       
      fetchIntegrationPack,       
    }),
    [instance, isLoading, error, fetch]
  );
}
