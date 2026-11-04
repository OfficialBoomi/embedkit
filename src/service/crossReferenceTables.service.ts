import { useHttp } from './http';
import logger from '../logger.service';
import type { CrtServerTablesResponse } from '../utils/crt/crtLiveSource';

export type FetchCrossReferenceTablesArgs = {
  integrationPackInstanceId: string;
  environmentId: string;
  signal?: AbortSignal;
};

export function useCrossReferenceTablesService() {
  const http = useHttp();

  /** The overrideable cross reference tables of an installed pack, with headers, default rows and override rows. */
  async function fetchCrossReferenceTables(
    args: FetchCrossReferenceTablesArgs
  ): Promise<CrtServerTablesResponse> {
    const { signal, ...params } = args;
    logger.debug('Service: fetchCrossReferenceTables', params);
    return http.get('/cross-reference-tables', { params, signal });
  }

  return { fetchCrossReferenceTables };
}
