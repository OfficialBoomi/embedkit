import { useCallback, useMemo } from 'react';
import { useHttp } from '../http';
import logger from '../../logger.service';

export type AdminSessionItem = {
  jti: string;
  sub: string;
  par: string;
  issuedAt?: number;
};

export type ListSessionsResponse = {
  items: AdminSessionItem[];
  nextCursor?: string | null;
};

export type ListSessionsArgs = {
  tenantId?: string;
  subAccountId?: string;
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
};

export type AdminKeyItem = {
  key: string;
  type: string;
  ttl: number | null;
  valuePreview: string;
  tenantId?: string | null;
  subAccountId?: string | null;
};

export type ListKeysResponse = {
  items: AdminKeyItem[];
  nextCursor?: string | null;
};

export type ListKeysArgs = {
  tenantId?: string;
  type?: string;
  subAccountId?: string;
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
};

export type ListKeyTypesResponse = {
  items: string[];
  isSuperAdmin?: boolean;
};

export type KeyDetailsResponse = {
  key: string;
  type: string;
  ttl: number | null;
  redisType: string;
  value: string | null;
  editable?: boolean;
};

export function useAdminRedisService() {
  const http = useHttp();

  const listSessions = useCallback(async (args: ListSessionsArgs = {}): Promise<ListSessionsResponse> => {
    const { signal, ...params } = args;
    logger.debug('[useAdminRedisService.listSessions]', params);
    return http.get('/admin/redis/sessions', { params, signal });
  }, [http]);

  const listSessionsAll = useCallback(async (args: ListSessionsArgs = {}): Promise<ListSessionsResponse> => {
    const { signal, ...params } = args;
    logger.debug('[useAdminRedisService.listSessionsAll]', params);
    return http.get('/admin/redis/sessions/all', { params, signal });
  }, [http]);

  const listKeys = useCallback(async (args: ListKeysArgs = {}): Promise<ListKeysResponse> => {
    const { signal, ...params } = args;
    logger.debug('[useAdminRedisService.listKeys]', params);
    return http.get('/admin/redis/keys', { params, signal });
  }, [http]);

  const listKeysAll = useCallback(async (args: ListKeysArgs = {}): Promise<ListKeysResponse> => {
    const { signal, ...params } = args;
    logger.debug('[useAdminRedisService.listKeysAll]', params);
    return http.get('/admin/redis/keys/all', { params, signal });
  }, [http]);

  const listSubAccounts = useCallback(async (
    tenantId?: string,
    signal?: AbortSignal
  ): Promise<{ items: string[] }> => {
    logger.debug('[useAdminRedisService.listSubAccounts]', { tenantId });
    return http.get('/admin/redis/sub-accounts', { params: { tenantId }, signal });
  }, [http]);

  const listTenants = useCallback(async (signal?: AbortSignal): Promise<{ items: string[] }> => {
    logger.debug('[useAdminRedisService.listTenants]');
    return http.get('/admin/redis/tenants', { signal });
  }, [http]);

  const listKeyTypes = useCallback(async (signal?: AbortSignal): Promise<ListKeyTypesResponse> => {
    logger.debug('[useAdminRedisService.listKeyTypes]');
    return http.get('/admin/redis/key-types', { signal });
  }, [http]);

  const getKeyDetails = useCallback(async (
    key: string,
    opts?: { reveal?: boolean; signal?: AbortSignal }
  ): Promise<KeyDetailsResponse> => {
    logger.debug('[useAdminRedisService.getKeyDetails]', { key, reveal: opts?.reveal });
    return http.get('/admin/redis/keys/detail', {
      params: { key, reveal: opts?.reveal },
      signal: opts?.signal,
    });
  }, [http]);

  const updateKey = useCallback(async (
    key: string,
    value: string,
    ttlSeconds?: number,
    signal?: AbortSignal
  ): Promise<void> => {
    logger.debug('[useAdminRedisService.updateKey]', { key, ttlSeconds });
    await http.put('/admin/redis/keys', { key, value, ttlSeconds }, { signal });
  }, [http]);

  const deleteKey = useCallback(async (key: string, signal?: AbortSignal): Promise<void> => {
    logger.debug('[useAdminRedisService.deleteKey]', { key });
    await http.del('/admin/redis/keys', { params: { key }, signal });
  }, [http]);

  const clearTenant = useCallback(async (signal?: AbortSignal): Promise<{ deleted: number }> => {
    logger.debug('[useAdminRedisService.clearTenant]');
    return http.post('/admin/redis/clear/tenant', {}, { signal });
  }, [http]);

  const clearSubAccount = useCallback(async (
    subAccountId: string,
    signal?: AbortSignal
  ): Promise<{ deleted: number }> => {
    logger.debug('[useAdminRedisService.clearSubAccount]', { subAccountId });
    return http.post('/admin/redis/clear/sub-account', { subAccountId }, { signal });
  }, [http]);

  const revokeSessions = useCallback(async (
    subAccountId: string,
    signal?: AbortSignal
  ): Promise<{ revoked: number }> => {
    logger.debug('[useAdminRedisService.revokeSessions]', { subAccountId });
    return http.post('/admin/redis/sessions/revoke', { subAccountId }, { signal });
  }, [http]);

  return useMemo(
    () => ({
      listSessions,
      listSessionsAll,
      listKeys,
      listKeysAll,
      listSubAccounts,
      listTenants,
      listKeyTypes,
      getKeyDetails,
      deleteKey,
      clearTenant,
      clearSubAccount,
      revokeSessions,
      updateKey,
    }),
    [
      listSessions,
      listSessionsAll,
      listKeys,
      listKeysAll,
      listSubAccounts,
      listTenants,
      listKeyTypes,
      getKeyDetails,
      deleteKey,
      clearTenant,
      clearSubAccount,
      revokeSessions,
      updateKey,
    ]
  );
}
