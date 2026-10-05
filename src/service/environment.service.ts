import type { EnvironmentQueryResponse } from '@boomi/embedkit-sdk';
import { useHttp } from './http';
import logger from '../logger.service';

export type GetEnvironmentsArgs = {
  includeEnvironments?: 'PROD' | 'TEST' | 'ALL';
  environmentId?: string;
  /** false skips per-environment runtime/ONLINE lookups (pickers only need names). */
  includeStatus?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
};

export function useEnvironmentsService() {
  const http = useHttp();

  async function getEnvironments(
    args: GetEnvironmentsArgs
  ): Promise<EnvironmentQueryResponse> {
    const { includeEnvironments, environmentId, includeStatus, search, page, pageSize, signal } = args;
    logger.debug('Fetching environments via service', args);
    return http.get('/environments', {
      signal,
      params: {
        ...(includeEnvironments ? { includeEnvironments } : {}),
        ...(environmentId ? { environmentId } : {}),
        ...(includeStatus === false ? { includeStatus: 'false' } : {}),
        ...(search ? { search } : {}),
        ...(page !== undefined ? { page } : {}),
        ...(pageSize !== undefined ? { pageSize } : {}),
      },
    });
  }
  return { getEnvironments };
}
