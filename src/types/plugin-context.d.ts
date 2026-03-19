/**
 * @file /types/plugin-context.d.ts
 * @license BSD-2-Clause
 *
 * Minimal context types for the BFF/JWT-powered EmbedKit plugin.
 * No theme/ai/oauth2 in the context; those are not part of the new contract.
 */

import type { PluginUiConfig } from './plugin-ui.config';

/** Allows components to render other components into the same host. */
export type BoundRender = <T extends string>(args: {
  component: T;
  props: any;
  componentKey?: string;
}) => void;

/** Thin server API surface; services/hooks can build on top of this. */
export interface ServerApi {
  get:  (path: string, init?: RequestInit) => Promise<Response>;
  post: (path: string, body?: unknown, init?: RequestInit) => Promise<Response>;
  put:  (path: string, body?: unknown, init?: RequestInit) => Promise<Response>;
  del:  (path: string, init?: RequestInit) => Promise<Response>;
}

/** What consumer components read from the plugin context. */
export interface PluginContextValue {
  /** Optional UI/UX configuration injected at bootstrap. */
  boomiConfig?: PluginUiConfig;

  /** Tenant identifier (primaryAccountId) used for CORS/server calls. */
  tenantId?: string;

  /** Host/slot identity for multi-mount scenarios. */
  hostId?: string;
  componentKey?: string;

  /** Helper to render another component into this host. */
  renderComponent?: BoundRender;

  /** Ready flag for the overall plugin shell (not request-specific). */
  isReady: boolean;

  /** Simple global loading flag you can control from features/screens. */
  pageIsLoading: boolean;

  /** Short-lived JWT kept in memory (null until the nonce exchange completes). */
  accessToken: string | null;

  /** Low-level server API wrapper (adds Bearer + refresh on 401). */
  serverApi: ServerApi;

  /** Control the global loading flag. */
  setPageIsLoading: (loading: boolean) => void;

  /** Clear in-memory token and call server logout (revokes refresh cookie). */
  logout: () => void;

  /** The base url of the embedkit server passed into the context.  */
  serverBase: string;
}

/** What the provider needs from the host bootstrapping code. */
export interface PluginContextProps {
  /** The tenantId for CORS on the server. This is typically your boomi parent account Id */
  tenantId: string;

  /** React children to wrap. */
  children: React.ReactNode;

  /** Optional UI/UX configuration passed at init time. */
  boomiConfig?: PluginUiConfig;

  /** Host/slot identity for multi-mount scenarios. */
  hostId?: string;
  componentKey?: string;

  /** Helper to render another component into this host. */
  renderComponent?: BoundRender;

  /** Base URL to the embedkit server (e.g., "/api/v1" or "https://boomi.space/embedkit-server/api/v1"). */
  serverBase?: string;
}
