/**
 * @file useEmbedKit.ts
 * @hook useEmbedKit
 * @license BSD-2-Clause
 * @description
 * Convenience hook that exposes the most commonly-used fields from `usePlugin()`
 * so consumer apps don’t need to know your internal context shape.
 */

// src/hooks/useEmbedKit.ts
import { usePlugin } from '../context/pluginContext';
import type { PluginUiConfig } from '../types/plugin-ui.config';
import type { ServerApi } from '../types/plugin-context';

export type UseEmbedKit = {
  hostId?: string;
  componentKey?: string;
  pageIsLoading: boolean;
  isReady: boolean;
  accessToken: string | null;      // matches PluginContext state
  serverApi: ServerApi;            // not a string
  boomiConfig?: PluginUiConfig;
  setPageIsLoading: (v: boolean) => void;
  logout: () => void;
};

export function useEmbedKit(): UseEmbedKit {
  const {
    hostId,
    componentKey,
    pageIsLoading,
    isReady,
    accessToken,
    serverApi,
    boomiConfig,
    setPageIsLoading,
    logout,
  } = usePlugin();

  return {
    hostId,
    componentKey,
    pageIsLoading,
    isReady,
    accessToken,
    serverApi,
    boomiConfig,
    setPageIsLoading,
    logout,
  };
}
