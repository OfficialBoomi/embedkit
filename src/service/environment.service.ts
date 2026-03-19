import type { EnvironmentQueryResponse } from '@boomi/embedkit-sdk';
import { useHttp } from './http';
import logger from '../logger.service';

export type GetEnvironmentsArgs = {
  includeEnvironments?: 'PROD' | 'TEST' | 'ALL';
  environmentId?: string;
  signal?: AbortSignal;
};

export function useEnvironmentsService() {
  const http = useHttp();

  async function getEnvironments(
    args: GetEnvironmentsArgs
  ): Promise<EnvironmentQueryResponse> {
    const { includeEnvironments, environmentId, signal } = args;
    logger.debug('Fetching environments via service', args);
    return http.get('/environments', {
      signal,
      params: {
        ...(includeEnvironments ? { includeEnvironments } : {}),
        ...(environmentId ? { environmentId } : {}),
      },
    });
  }
  return { getEnvironments };
}
