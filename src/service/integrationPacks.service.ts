// src/services/integrationPacks.service.ts
import { useHttp } from './http';
import type { IntegrationPackInstance, IntegrationPackInstanceQueryResponse } from '@boomi/embedkit-sdk';
import logger from '../logger.service';

export type GetEligiblePacksArgs = {
  renderType: string;
  notAllowedIds?: string[];
  signal?: AbortSignal;
};

export type GetIntegrationPacksArgs = {
  renderType: string;
  search?: string;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
};

export type GetIntegrationPackArgs = {
  integrationPackId: string;
  signal?: AbortSignal;
};

export type CreateIntegrationPackArgs = {
  integrationPackId: string;
  isSingleInstall?: boolean;    
  environmentId: string;
  integrationPackOverrideName?: string;
  signal?: AbortSignal;
};

export function useIntegrationPacksService() {
  const http = useHttp();

  async function getIntegrationPacks(
    args: GetIntegrationPacksArgs
  ): Promise<IntegrationPackInstanceQueryResponse> {
    const { search, page, pageSize, signal } = args;
    logger.debug('Fetching integration packs from service', args);
    return http.get('/integration-packs', {
      signal,
      params: {
        renderType: args.renderType,
        ...(search ? { search } : {}),
        ...(typeof page === 'number' ? { page } : {}),
        ...(typeof pageSize === 'number' ? { pageSize } : {}),
      },
    });
  }

  async function getIntegrationPack(
    args: GetIntegrationPackArgs
  ): Promise<IntegrationPackInstanceQueryResponse> {
    const { integrationPackId, signal } = args;
    logger.debug('Fetching integration pack from service', args);
    return http.get('/integration-packs/findOne', {
      signal,
      params: {
        integrationPackId
      },
    });
  }

  async function createIntegrationPack(
    args: CreateIntegrationPackArgs
  ): Promise<IntegrationPackInstance> {
    const { signal, ...body } = args;
    logger.debug('Creating integration pack instance via service', body);
    return http.post('/integration-packs', body, { signal });
  }

  async function getEligibleIntegrationPacks(
    args: GetEligiblePacksArgs
  ): Promise<IntegrationPackInstanceQueryResponse> {
    const { renderType, notAllowedIds, signal } = args;
    logger.debug('Fetching eligible Integration Packs for account group');
    return http.get('/integration-packs/eligible', {
      signal,
      params: {
        renderType: renderType,
        ...(notAllowedIds ? { notAllowedIds: notAllowedIds.join(',') } : {}),
      },
    });
  }

  async function deleteIntegrationPackInst(
    integrationPackInstanceId: string,
    opts?: { signal?: AbortSignal }
  ): Promise<void> {
    logger.debug('Deleting integration pack instance via service', { integrationPackInstanceId });
    await http.del(`/integration-packs/${encodeURIComponent(integrationPackInstanceId)}`, {
      signal: opts?.signal,
    });
  }
  return {
    getIntegrationPacks,
    getIntegrationPack,
    createIntegrationPack,
    getEligibleIntegrationPacks,
    deleteIntegrationPackInst, 
  };
}
