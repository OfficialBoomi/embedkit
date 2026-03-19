/**
 * @file useAgentStatus.ts
 * @function useAgentStatus
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Fetches a single IntegrationPackInstance
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import type { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import type { AgentConfig } from '../../types/agent.config';
import { useIntegrationPacksService } from '../../service/integrationPacks.service';
import logger from '../../logger.service';

export function useAgentStatus(
  integrationPackId: string,
  environmentId: string,
  agentName: string,
  transport?: AgentConfig['transport']
) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [instance, setInstance] = useState<IntegrationPackInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const { getIntegrationPack, createIntegrationPack } = useIntegrationPacksService();

  const fetchStatus = useCallback(async () => {
    if (transport === 'boomi-direct') {
      setInstalled(true);
      setInstance({
        integrationPackId,
        environmentId,
        integrationPackOverrideName: agentName,
        installationType: 'MULTI',
        installed: true,
        isAgent: true,
      });
      setErr(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErr(null);
    try {
      setInstalled(false);
      lastKeyRef.current = `${integrationPackId}`;

      const resp = await getIntegrationPack({
        integrationPackId
      });
      const instance = resp.result && resp.result.length > 0 ? resp.result[0] : null;
      if (instance) {
        instance.environmentId = environmentId;
        logger.debug('useAgentStatus - fetched instance', instance);
        setInstance(instance);
        setInstalled(true);
      } else {
        setInstance(null);
        const created = await createIntegrationPack({
          integrationPackId,
          isSingleInstall: false,
          environmentId,
          integrationPackOverrideName: agentName,
        });

        if (created) {
          setInstance(created);
          setInstalled(true);
        } else {
          throw new Error('Failed to create agent instance');
        }
      }

    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load agent status');
      setInstalled(false);
    } finally {
      setLoading(false);
    }
  }, [integrationPackId, environmentId, agentName, transport]);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  return { instance, installed, loading, error: err, refetch: fetchStatus };
}
