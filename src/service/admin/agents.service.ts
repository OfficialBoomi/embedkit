import { useCallback, useMemo } from 'react';
import { useHttp } from '../http';
import logger from '../../logger.service';

export type PublicAgentItem = {
  agentId: string;
  label?: string;
  boomiAgentId?: string;
  createdAt: string;
  updatedAt: string;
  publicTokenIds?: string[];
  allowedOrigins?: string[];
  config?: Record<string, unknown> | null;
};

export type AvailableBoomiAgent = {
  id: string;
  name: string;
  objective?: string | null;
  agent_status?: string | null;
};

export type ListAgentsArgs = {
  primaryAccountId: string;
  includeDetails?: boolean;
  signal?: AbortSignal;
};

export type CreateAgentArgs = {
  primaryAccountId: string;
  agentId: string;
  boomiAgentId?: string;
  label?: string;
  allowedOrigins?: string[];
  config?: Record<string, unknown> | null;
  publicTokenIds?: string[];
  createToken?: boolean;
  rateLimit?: Record<string, unknown>;
  signal?: AbortSignal;
};

export type DeleteAgentArgs = {
  primaryAccountId: string;
  agentId: string;
  signal?: AbortSignal;
};

export type ListAgentsResponse = {
  items: PublicAgentItem[];
};

export type ListAvailableAgentsResponse = {
  items: AvailableBoomiAgent[];
};

export type CreateAgentResponse = {
  agent: PublicAgentItem;
  createdToken?: { tokenId: string } | null;
};

export function useAgentsService() {
  const http = useHttp();

  const basePath = useCallback((primaryAccountId: string) => {
    return `/admin/agents/${encodeURIComponent(primaryAccountId)}`;
  }, []);

  const listAgents = useCallback(async (args: ListAgentsArgs): Promise<ListAgentsResponse> => {
    const { primaryAccountId, includeDetails, signal } = args;
    logger.debug('[useAgentsService.listAgents]', { primaryAccountId, includeDetails });
    return http.get(basePath(primaryAccountId), {
      signal,
      params: includeDetails ? { includeDetails: true } : undefined,
    });
  }, [http, basePath]);

  const listAvailableAgents = useCallback(async (
    args: ListAgentsArgs
  ): Promise<ListAvailableAgentsResponse> => {
    const { primaryAccountId, signal } = args;
    logger.debug('[useAgentsService.listAvailableAgents]', { primaryAccountId });
    return http.get(`${basePath(primaryAccountId)}/available`, { signal });
  }, [http, basePath]);

  const createAgent = useCallback(async (args: CreateAgentArgs): Promise<CreateAgentResponse> => {
    const {
      primaryAccountId,
      agentId,
      boomiAgentId,
      label,
      allowedOrigins,
      config,
      publicTokenIds,
      createToken,
      rateLimit,
      signal,
    } = args;

    logger.debug('[useAgentsService.createAgent]', { primaryAccountId, agentId });

    const payload: Record<string, unknown> = {
      agentId,
    };
    if (boomiAgentId !== undefined) payload.boomiAgentId = boomiAgentId;
    if (label !== undefined) payload.label = label;
    if (allowedOrigins !== undefined) payload.allowedOrigins = allowedOrigins;
    if (config !== undefined) payload.config = config;
    if (publicTokenIds !== undefined) payload.publicTokenIds = publicTokenIds;
    if (createToken !== undefined) payload.createToken = createToken;
    if (rateLimit !== undefined) payload.rateLimit = rateLimit;

    return http.post(basePath(primaryAccountId), payload, { signal });
  }, [http, basePath]);

  const deleteAgent = useCallback(async (args: DeleteAgentArgs): Promise<void> => {
    const { primaryAccountId, agentId, signal } = args;
    logger.debug('[useAgentsService.deleteAgent]', { primaryAccountId, agentId });
    await http.del(`${basePath(primaryAccountId)}/${encodeURIComponent(agentId)}`, { signal });
  }, [http, basePath]);

  return useMemo(
    () => ({
      listAgents,
      listAvailableAgents,
      createAgent,
      deleteAgent,
    }),
    [listAgents, listAvailableAgents, createAgent, deleteAgent]
  );
}
