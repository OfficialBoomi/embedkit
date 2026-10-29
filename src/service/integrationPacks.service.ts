// src/services/integrationPacks.service.ts
import { useHttp, HttpError } from './http';
import { usePlugin } from '../context/pluginContext';
import type { IntegrationPackInstance, IntegrationPackInstanceQueryResponse } from '@boomi/embedkit-sdk';
import logger from '../logger.service';
import { getStableBrowserId } from '../utils/browserId';
import type { ListSort } from '../utils/listSort';

export type { ListSort } from '../utils/listSort';

/** Environment / connector filter for the integrations list and the Add Integration catalog. */
export type ListFilters = { environmentIds: string[]; connectorTypes: string[] };
export const EMPTY_FILTERS: ListFilters = { environmentIds: [], connectorTypes: [] };

/** Whose "Last viewed" list to use: the host's userId when given, else this browser's id. */
type ViewerIds = { userId?: string; viewerId?: string };

/** Set once an older server answers 404 to the viewed call, so it is not called again. */
let viewedUnsupported = false;

/** Filter options returned by the server with `includeFacets`. */
export type ListFacets = {
  environments: Array<{ id: string; name?: string; classification?: string }>;
  connectors: Array<{ type: string; iconKey: string; displayName?: string; iconUrl?: string; platformIconIsGeneric?: boolean }>;
};

/** Query params for a filter (comma-separated lists, omitted when empty). */
const filterParams = (f?: ListFilters) => ({
  ...(f?.environmentIds?.length ? { filterEnvironmentIds: f.environmentIds.join(',') } : {}),
  ...(f?.connectorTypes?.length ? { filterConnectorTypes: f.connectorTypes.join(',') } : {}),
});

export type GetEligiblePacksArgs = {
  renderType: string;
  notAllowedIds?: string[];
  signal?: AbortSignal;
};

/** Paged eligible-pack request (Add Integration catalog). */
export type GetEligiblePacksPageArgs = GetEligiblePacksArgs & {
  search?: string;
  page: number;
  pageSize: number;
  includeConnectors?: boolean;
  filters?: ListFilters;
  includeFacets?: boolean;
};

export type EligiblePacksPage<T = any> = {
  result: T[];
  page: number;
  pageSize: number;
  numberOfResults: number;
  totalPages: number;
  facets?: ListFacets;
};

export type GetIntegrationPacksArgs = {
  renderType: string;
  search?: string;
  page?: number;
  pageSize?: number;
  /** Ask the server to attach connectors[] (for icons) to each instance. */
  includeConnectors?: boolean;
  sort?: ListSort;
  filters?: ListFilters;
  includeFacets?: boolean;
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
  const { userId } = usePlugin();

  /** The host's userId wins; otherwise this browser's id (nothing when the browser cannot keep one). */
  function viewerIds(): ViewerIds {
    const host = userId?.trim();
    if (host) return { userId: host };
    const browser = getStableBrowserId();
    return browser ? { viewerId: browser } : {};
  }

  async function getIntegrationPacks(
    args: GetIntegrationPacksArgs
  ): Promise<IntegrationPackInstanceQueryResponse & { facets?: ListFacets }> {
    const { search, page, pageSize, signal } = args;
    logger.debug('Fetching integration packs from service', args);
    return http.get('/integration-packs', {
      signal,
      params: {
        renderType: args.renderType,
        ...(search ? { search } : {}),
        ...(typeof page === 'number' ? { page } : {}),
        ...(typeof pageSize === 'number' ? { pageSize } : {}),
        ...(args.includeConnectors ? { includeConnectors: true } : {}),
        ...(args.sort ? { sortBy: args.sort.by, sortDir: args.sort.dir } : {}),
        ...(args.sort?.by === 'lastViewed' ? viewerIds() : {}),
        ...filterParams(args.filters),
        ...(args.includeFacets ? { includeFacets: true } : {}),
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

  /** One page of eligible packs; the server resolves connector icons for that page only. */
  async function getEligibleIntegrationPacksPage(args: GetEligiblePacksPageArgs): Promise<EligiblePacksPage> {
    const { renderType, notAllowedIds, signal, search, page, pageSize, includeConnectors, filters, includeFacets } = args;
    logger.debug('Fetching eligible Integration Packs page', { renderType, search, page, pageSize });
    return http.get('/integration-packs/eligible', {
      signal,
      params: {
        renderType,
        page,
        pageSize,
        ...(search ? { search } : {}),
        ...(includeConnectors === false ? { includeConnectors: 'false' } : {}),
        ...(notAllowedIds?.length ? { notAllowedIds: notAllowedIds.join(',') } : {}),
        ...filterParams(filters),
        ...(includeFacets ? { includeFacets: true } : {}),
      },
    });
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
      params: viewerIds(),
    });
  }

  /**
   * Tells the server this viewer opened an instance, for the "Last viewed" sort. Never throws and
   * never waits on the caller: a failure must not get in the way of opening the pack.
   */
  function markIntegrationPackViewed(integrationPackInstanceId: string): void {
    if (viewedUnsupported || !integrationPackInstanceId) return;
    http
      .post(`/integration-packs/${encodeURIComponent(integrationPackInstanceId)}/viewed`, viewerIds())
      .catch((e: unknown) => {
        if (e instanceof HttpError && e.status === 404) viewedUnsupported = true;
        logger.debug('[integrationPacks.service] could not record last viewed', e);
      });
  }
  return {
    getIntegrationPacks,
    getIntegrationPack,
    createIntegrationPack,
    getEligibleIntegrationPacks,
    getEligibleIntegrationPacksPage,
    deleteIntegrationPackInst,
    markIntegrationPackViewed,
  };
}
