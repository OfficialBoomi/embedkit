import type { 
  EnvironmentExtensions,
  EnvironmentMapExtension, 
  EnvironmentMapExtensionCandidate,
  BrowseCandidate,
  BrowseCandidateResponse,
  EnvExtMinimal
 } from '@boomi/embedkit-sdk';
import { useHttp } from './http';
import logger from '../logger.service';
import { map } from 'zod';

export type GetMapExtensionArgs = {
  integrationPackInstanceId: string;
  environmentId: string;
  signal?: AbortSignal;
};

export type DynamicBrowseArgs = {
  candidates: BrowseCandidate[];
  signal?: AbortSignal;
};

export type MapFunctionBrowseArgs = {
  originals: EnvironmentExtensions[],
  updated: EnvExtMinimal[],
  integrationPackInstanceId: string,
  environmentId: string
};

export function useMapExtensionsService() {
  const http = useHttp();

  async function getMapExtensions(
    args: GetMapExtensionArgs
  ): Promise<EnvironmentMapExtensionCandidate[]> {
    const { integrationPackInstanceId, environmentId, signal } = args;
    logger.debug('Fetching map extensions via service', args);
    return http.get('/map-extensions', {
      signal,
      params: {
        integrationPackInstanceId,
        environmentId,
      },
    });
  }

  async function updateMapExtension (
    mapExtension: EnvironmentMapExtension
  ): Promise<EnvironmentMapExtension> {
    logger.debug('updating map extension via service', mapExtension);
    return http.post('/map-extensions/update', {
      mapExtension
    });
  }

  async function dynamicBrowseMapExtensions(
    args: DynamicBrowseArgs
  ): Promise<BrowseCandidateResponse> {
    const { candidates, signal } = args;
    logger.debug('Dynamically browsing candidates via service', args);
    return http.post('/map-extensions/dynamic-browse', {
      signal,
      candidates
    });
  }

  async function mapFunctionBrowse(
    args: MapFunctionBrowseArgs
  ): Promise<BrowseCandidateResponse> {
    const { originals, updated, integrationPackInstanceId, environmentId} = args;
    
    logger.debug('Functionally browsing map before edit via service', args);
    return http.post('/map-extensions/browse', {
      originals,
      updated,
      integrationPackInstanceId,
      environmentId
    });
  }

  return { getMapExtensions, updateMapExtension, dynamicBrowseMapExtensions, mapFunctionBrowse};
}
