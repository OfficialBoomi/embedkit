import { useCallback, useMemo } from 'react';
import { useHttp } from '../http';
import logger from '../../logger.service';

export type AgentUserItem = {
  userId: string;
  boomiAccountId: string;
  boomiApiUserName: string;
  label?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ListAgentUsersArgs = {
  primaryAccountId: string;
  signal?: AbortSignal;
};

export type CreateAgentUserArgs = {
  primaryAccountId: string;
  userId: string;
  boomiAccountId: string;
  boomiApiUserName: string;
  boomiApiToken?: string;
  label?: string;
  signal?: AbortSignal;
};

export type DeleteAgentUserArgs = {
  primaryAccountId: string;
  userId: string;
  signal?: AbortSignal;
};

export type ListAgentUsersResponse = {
  items: AgentUserItem[];
};

export function useAgentUsersService() {
  const http = useHttp();

  const basePath = useCallback((primaryAccountId: string) => {
    return `/admin/agent-users/${encodeURIComponent(primaryAccountId)}`;
  }, []);

  const listAgentUsers = useCallback(async (args: ListAgentUsersArgs): Promise<ListAgentUsersResponse> => {
    const { primaryAccountId, signal } = args;
    logger.debug('[useAgentUsersService.listAgentUsers]', { primaryAccountId });
    return http.get(basePath(primaryAccountId), { signal });
  }, [http, basePath]);

  const createAgentUser = useCallback(async (args: CreateAgentUserArgs): Promise<AgentUserItem> => {
    const {
      primaryAccountId,
      userId,
      boomiAccountId,
      boomiApiUserName,
      boomiApiToken,
      label,
      signal,
    } = args;

    logger.debug('[useAgentUsersService.createAgentUser]', { primaryAccountId, userId });

    const payload: Record<string, unknown> = {
      userId,
      boomiAccountId,
      boomiApiUserName,
    };
    if (boomiApiToken) payload.boomiApiToken = boomiApiToken;
    if (label !== undefined) payload.label = label;

    return http.post(basePath(primaryAccountId), payload, { signal });
  }, [http, basePath]);

  const deleteAgentUser = useCallback(async (args: DeleteAgentUserArgs): Promise<void> => {
    const { primaryAccountId, userId, signal } = args;
    logger.debug('[useAgentUsersService.deleteAgentUser]', { primaryAccountId, userId });
    await http.del(`${basePath(primaryAccountId)}/${encodeURIComponent(userId)}`, { signal });
  }, [http, basePath]);

  return useMemo(
    () => ({
      listAgentUsers,
      createAgentUser,
      deleteAgentUser,
    }),
    [listAgentUsers, createAgentUser, deleteAgentUser]
  );
}
