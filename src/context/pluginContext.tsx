/**
 * @file pluginContext.tsx
 * @license BSD-2-Clause
 *
 * React context for the EmbedKit UI (Node.js/JWT). Keeps an in-memory access token,
 * refreshes it via HttpOnly refresh cookie, and exposes a minimal serverApi.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PluginContextValue, PluginContextProps, ServerApi } from '../types/plugin-context';
import type { PluginUiConfig } from '../types/plugin-ui.config';
import AuthManager from '../security/authManager';

const PluginContext = createContext<PluginContextValue | undefined>(undefined);
const auth = AuthManager.get();

/** Hook to access the Plugin context. */
export function usePlugin(): PluginContextValue {
  const ctx = useContext(PluginContext);
  if (!ctx) throw new Error('usePlugin must be used within a PluginContextProvider');
  return ctx;
}

/** helpers */
function isFormData(body: unknown): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function withTenant(headers: HeadersInit | undefined, tenantId?: string): HeadersInit {
  const base = new Headers(headers ?? {});
  if (tenantId && !base.has('X-Tenant-Id')) base.set('X-Tenant-Id', tenantId);
  return base;
}

/** Provider that manages JWT lifecycle and exposes a typed Server API. */
const PluginContextProvider = ({
  children,
  hostId,
  componentKey,
  renderComponent,
  serverBase = '/api/v1',
  tenantId,
  nonce,
  boomiConfig,
}: PluginContextProps & { nonce?: string }) => {
  const auth = AuthManager.get();
  const [accessToken, setAccessToken] = useState<string | null>(auth.getToken());
  const [pageIsLoading, setPageIsLoading] = useState(false);
  const [isReady] = useState(true);

  // normalize once so everyone uses the same string
  const serverBaseNorm = useMemo(
    () => serverBase.replace(/\/$/, ''),
    [serverBase]
  );

  useEffect(() => {
    let unsub: (() => void) | undefined;
    auth.bootstrap({ serverBase: serverBaseNorm, tenantId, nonce });
    unsub = auth.subscribeToken((tok) => setAccessToken(tok));
    return () => { unsub?.(); };
  }, [auth, serverBaseNorm, tenantId, nonce]);


  const serverApi: ServerApi = useMemo(() => {
    const base = serverBaseNorm;

    return {
      get: (path, init) =>
        auth.fetchWithJwt(`${base}${path}`, {
          method: 'GET',
          ...init,
          headers: withTenant(init?.headers, tenantId),
        }),

      post: (path, body, init) => {
        const fd = isFormData(body);
        const headers = new Headers(withTenant(init?.headers, tenantId));
        if (!fd && body !== undefined && !headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json; charset=utf-8');
        }
        return auth.fetchWithJwt(`${base}${path}`, {
          method: 'POST',
          ...init,
          headers,
          body: body === undefined ? undefined : (fd ? body as FormData : JSON.stringify(body)),
        });
      },

      put: (path, body, init) => {
        const fd = isFormData(body);
        const headers = new Headers(withTenant(init?.headers, tenantId));
        if (!fd && body !== undefined && !headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json; charset=utf-8');
        }
        return auth.fetchWithJwt(`${base}${path}`, {
          method: 'PUT',
          ...init,
          headers,
          body: body === undefined ? undefined : (fd ? body as FormData : JSON.stringify(body)),
        });
      },

      del: (path, init) =>
        auth.fetchWithJwt(`${base}${path}`, {
          method: 'DELETE',
          ...init,
          headers: withTenant(init?.headers, tenantId),
        }),
    };
  }, [auth, serverBaseNorm, tenantId]);

const value: PluginContextValue = {
  hostId,
  componentKey,
  renderComponent,
  isReady,
  pageIsLoading,
  accessToken,
  tenantId,
  serverApi,
  boomiConfig: boomiConfig as PluginUiConfig | undefined,
  setPageIsLoading,
  logout: () => window.dispatchEvent(new CustomEvent('boomi:logout')),
  serverBase: serverBaseNorm,
  };

  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>;
};

export default PluginContextProvider;
