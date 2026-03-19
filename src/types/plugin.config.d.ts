/**
 * @file plugin.config.d.ts
 * @license BSD-2-Clause
 *
 * Minimal config passed from the host to initialize the Boomi Plugin.
 */
import type { Theme } from './theme';
import type { Ai } from './ai';
import type { Oauth2 } from './ouath2';
import type { PluginUiConfig } from './plugin-ui.config';

export type PluginConfig = {
  /** The tenantId for CORS on the server. This is typically your boomi parent account Id */
  tenantId: string;

  /** Base URL to the embedkit server (e.g., "/api/v1" or "https://boomi.space/embedkit-server/api/v1"). */
  serverBase: string;

  /** One-time nonce the host app obtained from the server login flow. */
  nonce?: string;

  /** Optional access token (public embed flow). */
  accessToken?: string;

  /** Optional UI/UX configuration for the plugin. */
  boomiConfig?: PluginUiConfig;
};
