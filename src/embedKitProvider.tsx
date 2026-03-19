
/**
 * @file embedKitProvider.tsx
 * @component EmbedKitProvider
 * @license BSD-2-Clause
 * @description
 * Thin wrapper over the plugin context provider that accepts either a full PluginConfig
 * or lightweight props and calls `createEmbedKit()` internally.
 */
import React, { PropsWithChildren, createElement, ReactElement } from 'react';
import PluginContextProvider from './context/pluginContext';
import type { PluginConfig } from './types/plugin.config';

export type EmbedKitProviderProps = PropsWithChildren & { config: PluginConfig };

export default function EmbedKitProvider({ config, children }: EmbedKitProviderProps): ReactElement {
  // No JSX in .ts files:
  return createElement(
    PluginContextProvider as any,
    {
      serverBase: config.serverBase,
      tenantId: config.tenantId,
      nonce: config.nonce,          
      boomiConfig: config.boomiConfig,
    },
    children as any
  );
}
