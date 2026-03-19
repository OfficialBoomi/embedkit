import type { 
  EnvironmentExtensionsQueryResponse, 
  UpdateResult,
  EnvironmentExtensions,
  EnvExtMinimal
} from '@boomi/embedkit-sdk';
import { useHttp } from './http';
import logger from '../logger.service';

export type FetchEnvExtensionsArgs = {
  integrationPackInstanceId: string;
  environmentId?: string;
  environmentIds?: string[];
  isSingleInstall?: boolean;
  signal?: AbortSignal;
};

export type UpdateEnvExtensionsArgs = {
  originals: EnvironmentExtensions[]; 
  combinedEdited: EnvExtMinimal[];
  signal?: AbortSignal;
};

export type FetchConnectionStatusArgs = {
  integrationPackInstanceId: string;
  environmentId: string;
  connectionId: string;
  fieldId: string;
  signal?: AbortSignal;
};

export function useEnvironmentExtensionsService() {
  const http = useHttp();
  
  async function fetchEnvironmentExtensions(
    args: FetchEnvExtensionsArgs
  ): Promise<EnvironmentExtensionsQueryResponse> {
    const { signal, ...body } = args;
    logger.debug('Service: fetchEnvironmentExtensions', body);
    return http.post('/environment-extensions', body, { signal });
  }

  async function updateEnvironmentExtensions(
    args: UpdateEnvExtensionsArgs,
  ): Promise<UpdateResult> {
    const { signal, ...body } = args;
    logger.debug('Service: updateEnvironmentExtensions', {
      body,
    });
    return http.post('/environment-extensions/update', body, { signal });
  }

  async function fetchOauth2Url(
    args: FetchConnectionStatusArgs
  ): Promise<string> {
    const { signal, ...body } = args;
    logger.debug('Service: fetchOauth2Url', body);
    return http.post('/environment-extensions/oauth2', body, { signal });
  }

  async function fetchConnectionStatus(
    args: FetchConnectionStatusArgs
  ): Promise<boolean> {
    const { signal, ...body } = args;
    logger.debug('Service: fetchConnectionStatus', body);
    return http.post('/environment-extensions/connection-status', body, { signal });
  }

  return { fetchEnvironmentExtensions, updateEnvironmentExtensions, fetchConnectionStatus, fetchOauth2Url };
}


