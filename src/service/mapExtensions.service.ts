import type { 
  EnvironmentExtensions,
  EnvironmentMapExtension, 
  EnvironmentMapExtensionCandidate,
  BrowseCandidate,
  BrowseCandidateResponse,
  EnvExtMinimal,
  MapExtensionsFunction
 } from '@boomi/embedkit-sdk';
import { useHttp } from './http';
import logger from '../logger.service';
import { map } from 'zod';

/** How long a credential check may run before the client gives up (just over the hosted server's 30 s limit). */
export const DYNAMIC_BROWSE_TIMEOUT_MS = 35_000;

export type GetMapExtensionArgs = {
  integrationPackInstanceId: string;
  environmentId: string;
  isSingleInstall?: boolean;
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
  environmentId: string,
  isSingleInstall?: boolean
};

/** Result of compiling a platform-defined function into Custom Scripting. */
export type CompiledFunctionScript = {
  language: 'Javascript';
  script: string;
  inputs: { key: number; name: string; dataType?: string }[];
  outputs: { key: number; name: string }[];
  warnings: string[];
};

export function useMapExtensionsService() {
  const http = useHttp();

  async function getMapExtensions(
    args: GetMapExtensionArgs
  ): Promise<EnvironmentMapExtensionCandidate[]> {
    const { integrationPackInstanceId, environmentId, isSingleInstall, signal } = args;
    logger.debug('Fetching map extensions via service', args);
    return http.get('/map-extensions', {
      signal,
      params: {
        integrationPackInstanceId,
        environmentId,
        isSingleInstall,
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
    // Never log the candidates here: they carry the values the user just typed.
    logger.debug('Dynamically browsing candidates via service', { count: candidates.length });

    // Give up after a fixed time so the caller can show an error instead of waiting forever.
    // The caller's own signal (if any) aborts the request too.
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) onCallerAbort();
    signal?.addEventListener('abort', onCallerAbort);
    const timer = setTimeout(
      () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
      DYNAMIC_BROWSE_TIMEOUT_MS
    );
    try {
      return await http.post<BrowseCandidateResponse>(
        '/map-extensions/dynamic-browse',
        { candidates },
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  async function mapFunctionBrowse(
    args: MapFunctionBrowseArgs
  ): Promise<BrowseCandidateResponse> {
    const { originals, updated, integrationPackInstanceId, environmentId, isSingleInstall} = args;

    logger.debug('Functionally browsing map before edit via service', args);
    return http.post('/map-extensions/browse', {
      originals,
      updated,
      integrationPackInstanceId,
      environmentId,
      isSingleInstall
    });
  }

  /** Compile a platform-defined function into JavaScript for the Transformation Editor (opt-in). */
  async function compileFunction(fn: MapExtensionsFunction): Promise<CompiledFunctionScript> {
    logger.debug('compiling function to script via service', { id: fn.id, type: fn.type });
    return http.post('/map-extensions/compile-function', { function: fn });
  }

  return { getMapExtensions, updateMapExtension, dynamicBrowseMapExtensions, mapFunctionBrowse, compileFunction };
}
