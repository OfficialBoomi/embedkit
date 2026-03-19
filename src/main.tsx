/**
 * @file main.tsx
 * @license BSD-2-Clause
 *
 * Entry for the Boomi Plugin. Host calls BoomiPlugin({ serverBase, nonce, boomiConfig }).
 * We exchange the nonce for a JWT at `${serverBase}/auth/exchange`, then the PluginContext
 * manages the token and auto-refresh.
 */

import AuthManager from './security/authManager';
import React, { createRef } from 'react';
import ReactDOM from 'react-dom/client';
import PluginContextProvider from './context/pluginContext';
import Root from './components/Root';
import ErrorBoundary from './components/ErrorBoundary';
import tailwindCss from './main.css?inline';
import logger from './logger.service';

// components
import Agent from './components/agent/Agent';
import RunAgent from './components/agent/RunAgent';
import Integrations from './components/integration/Integrations';
import ConfigureIntegration from './components/integration/ConfigureIntegration';
import ExecutionHistory from './components/integration/ExecutionHistory';
import UpdateConnections from './components/integration/UpdateConnections';
import UpdateMaps from './components/integration/UpdateMaps';
import UpdateSchedules from './components/integration/UpdateSchedules';

// admin components
import AdminLayout from './components/admin/layout/AdminLayout';
import Cors from './components/admin/cors/Cors';
import RedisAdmin from './components/admin/redis/RedisAdmin';

// types only
import type { BoundRender } from './types/plugin-context';
import type { PluginConfig } from './types/plugin.config';
import type { RootRef } from './components/Root';

export const componentMap = {
  Integrations,
  Agent,
  RunAgent,
  ConfigureIntegration,
  ExecutionHistory,
  UpdateConnections,
  UpdateMaps,
  UpdateSchedules,
  AdminLayout,
  Cors,
  RedisAdmin,
};
type ComponentName = keyof typeof componentMap;
type MaybeWithKey<P> = P extends { componentKey: any }
  ? Omit<P, 'componentKey'> & { componentKey: string }
  : P;

type HostId = string;
type ComponentKey = string;
type HostRecord = {
  hostId: HostId;
  componentKey: ComponentKey;
  currentComponentName?: ComponentName;
  reactRoot: ReactDOM.Root | null;
  shadowRoot: ShadowRoot | null;
  rootRef: React.RefObject<RootRef | null>;
  initialized: boolean;
  mountEl?: HTMLElement | null;
};

/* ---------------------------
 * Global plugin config
 * --------------------------*/
let pluginConfig: PluginConfig | null = null;
declare global {
  interface Window {
    __BoomiPluginInitialized?: boolean;
    __BoomiPublicEmbedInitialized?: boolean;
    __BoomiAccessToken?: string;
    rootRefs?: Record<string, React.RefObject<RootRef | null>>;
    BoomiEmbed?: PublicEmbedConfig;
  }
}
const hosts: Record<HostId, HostRecord> = {};

/* ---------------------------
 * Blocking wait for auth ready
 * --------------------------*/
async function waitForAuthReady() {
  await AuthManager.get().ensureReady();
}

/* ---------------------------
 * CSS var helpers (per-host support)
 * --------------------------*/
function toVarName(key: string, prefix = '--boomi-show-') {
  const kebab = key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
  return `${prefix}${kebab}`;
}

/**
 * Applies config-driven CSS variables into the given ShadowRoot.
 * This version is host-aware; it will also apply per-componentKey overrides if present.
 */
function applyBoomiConfigVars(shadowRoot: ShadowRoot, config: any, componentKey: ComponentKey) {
  if (!config) return;

  const chunks: string[] = [];
  let globalCss = '';
  const flags = config.components ?? {};
  for (const [key, val] of Object.entries(flags)) {
    if (typeof val === 'boolean') globalCss += `${toVarName(key)}:${val ? '1' : '0'};`;
  }
  const vars = config.cssVars ?? {};
  for (const [k, v] of Object.entries(vars)) {
    if (String(k).startsWith('--')) globalCss += `${k}:${String(v)};`;
  }
  if (globalCss) chunks.push(`:host{${globalCss}}`);

  const byTheme = config.cssVarsByTheme ?? {};
  for (const [themeName, map] of Object.entries(byTheme)) {
    const block = Object.entries(map as Record<string, string>)
      .filter(([k]) => String(k).startsWith('--'))
      .map(([k, v]) => `${k}:${String(v)};`)
      .join('');
    if (block) chunks.push(`:host([data-theme="${themeName}"]){${block}}`);
  }

  const byKey = config.cssVarsByKey ?? {};
  const keyVars = byKey[componentKey] ?? {};
  const keyFlags = (config.componentsByKey?.[componentKey] ?? {}) as Record<string, boolean>;
  const componentCfg = config.components?.[componentKey];
  const offsetCfg = componentCfg?.modalOffset;

  let perKeyCss = '';
  for (const [key, val] of Object.entries(keyFlags)) {
    if (typeof val === 'boolean') perKeyCss += `${toVarName(key)}:${val ? '1' : '0'};`;
  }
  for (const [k, v] of Object.entries(keyVars)) {
    if (String(k).startsWith('--')) perKeyCss += `${k}:${String(v)};`;
  }
  if (offsetCfg) {
    const toCssVal = (val?: unknown) => {
      if (typeof val === 'number' && Number.isFinite(val)) return `${val}px`;
      if (typeof val === 'string' && val.trim().length > 0) return val;
      return null;
    };
    const xVal = toCssVal(
      (offsetCfg as any).offsetX ?? (offsetCfg as any).x ?? null
    );
    const yVal = toCssVal(
      (offsetCfg as any).offsetY ?? (offsetCfg as any).y ?? null
    );
    if (xVal) perKeyCss += `--boomi-modal-offset-x:${xVal};`;
    if (yVal) perKeyCss += `--boomi-modal-offset-y:${yVal};`;
  }
  if (perKeyCss) chunks.push(`:host{${perKeyCss}}`);

  if (chunks.length) {
    shadowRoot.querySelectorAll('style[data-boomi-vars]').forEach((el) => el.remove());
    const style = document.createElement('style');
    style.setAttribute('data-boomi-vars', 'true');
    style.textContent = chunks.join('\n');
    shadowRoot.appendChild(style);
  }
}

/* ---------------------------
 * Theme helpers (per-host)
 * --------------------------*/
function getThemeForKey(cfg: PluginConfig | null, key: ComponentKey): string {
  if (!cfg) return 'base';
  const theme = (cfg as any).boomiConfig?.theme
  if (!theme) return 'base';
  if (theme?.allowThemes === false) return 'base';
  logger.debug('Determining theme for key:', key, 'with config theme:', theme);

  /* TODO: re-enable per-key theme selection
  if (theme?.allowThemes) {
    const stored = localStorage.getItem(`boomi-plugin-theme:${key}`);
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const selected =
      perKeyTheme ||
      (stored === 'dark' ? 'dark'
       : stored === 'base' ? 'base'
       : stored === 'boomi' ? 'boomi'
       : prefersDark ? 'dark'
       : theme.defaultTheme || 'base');
    localStorage.setItem(`boomi-plugin-theme:${key}`, selected);
    return selected;
  }*/ 
  return theme.defaultTheme || 'base';
}


/** Inject Tailwind/CSS into a ShadowRoot once. */
function injectBaseStyles(shadowRoot: ShadowRoot) {
  if (shadowRoot.querySelector('style[data-boomi-base]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-boomi-base', 'true');
  style.textContent = `
  ${tailwindCss}
  /* Ensure the shadow host and mount can actually fill */
  :host { display:block; height:100%; width:100%; min-height:0; margin:0; padding:0; }
  #boomi-root {
    display:block;
    width:100%;
    height:100%;
    min-height:0;
    margin:0;
    padding:0;
    position:relative;
    transform: var(--boomi-root-transform, translateZ(0));
  }
  `;
  shadowRoot.appendChild(style);
}

/** Get or create host record for a given hostId and componentKey. */
function getOrCreateHost(hostId: HostId, componentKey: ComponentKey): HostRecord | null {
  const container = document.getElementById(hostId) as HTMLDivElement | null;
  if (!container) {
    logger.error(`Host element with id '#${hostId}' not found.`);
    return null;
  }

  if (!hosts[hostId]) {
    hosts[hostId] = {
      hostId,
      componentKey,
      reactRoot: null,
      shadowRoot: null,
      rootRef: createRef<RootRef>(),
      initialized: false,
      mountEl: null,
    };
  } else {
    if (componentKey) hosts[hostId].componentKey = componentKey;
  }

  return hosts[hostId];
}

/** Ensure a React root is mounted within the Shadow DOM for a host. */
async function ensureRootMountedForHost(host: HostRecord): Promise<boolean> {
  if (!pluginConfig) {
    logger.error('Plugin configuration not set before RenderComponent call.');
    return false;
  }
  const container = document.getElementById(host.hostId) as HTMLDivElement | null;
  if (!container) return false;

  const shadowRoot = container.shadowRoot ?? container.attachShadow({ mode: 'open' });
  host.shadowRoot = shadowRoot;

  let mountPoint = shadowRoot.getElementById('boomi-root') as HTMLElement | null;
  if (!mountPoint) {
    mountPoint = document.createElement('div');
    mountPoint.id = 'boomi-root';
    shadowRoot.appendChild(mountPoint);
  }
  const agentKey = host.componentKey;
  const agentCfg = pluginConfig?.boomiConfig?.agents?.[agentKey];
  const isAgent = host.currentComponentName === 'Agent';
  const isAgentModal = isAgent && agentCfg?.ui?.mode === 'modal';

  if (isAgentModal) {
    container.style.display = 'contents';
    container.style.position = 'static';
    container.style.width = 'auto';
    container.style.height = 'auto';
    container.style.minHeight = '0';
    container.style.pointerEvents = '';

    mountPoint.style.display = 'contents';
    mountPoint.style.height = 'auto';
    mountPoint.style.minHeight = '0';
  } else {
    container.style.display = 'block';
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.minHeight = '0';
    container.style.pointerEvents = '';

    mountPoint.style.display = 'block';
    mountPoint.style.height = '100%';
    mountPoint.style.minHeight = '0';
  }

  const mountChanged = host.mountEl !== mountPoint;
  const mountDisconnected = !host.mountEl || !host.mountEl.isConnected;

  if (!host.reactRoot || mountChanged || mountDisconnected) {
    try { host.reactRoot?.unmount(); } catch {}
    host.reactRoot = ReactDOM.createRoot(mountPoint);
    host.mountEl = mountPoint;
  }

  const theme = getThemeForKey(pluginConfig, host.componentKey);
  container.setAttribute('data-theme', theme);
  container.setAttribute('data-component-key', host.componentKey);

  logger.debug('Applying styles for host:', host.hostId, 'with theme:', theme);

  injectBaseStyles(shadowRoot);
  applyBoomiConfigVars(
    shadowRoot,
    pluginConfig?.boomiConfig ?? pluginConfig, 
    host.componentKey
  );

  if (!host.reactRoot) host.reactRoot = ReactDOM.createRoot(mountPoint);

  const renderInThisHost = ((args: {
    component: ComponentName;
    props: any;
    componentKey?: string;
    hostId?: string;
  }) => {
    RenderComponent({ ...args, hostId: host.hostId });
  }) as BoundRender;

  host.reactRoot.render(
    <PluginContextProvider
      hostId={host.hostId}
      componentKey={host.componentKey}
      renderComponent={renderInThisHost}
      serverBase={pluginConfig.serverBase || '/api/v1'}
      tenantId={pluginConfig.tenantId || ''}
      boomiConfig={pluginConfig.boomiConfig}
    >
      <ErrorBoundary>
        <Root ref={host.rootRef as unknown as React.RefObject<RootRef>} />
      </ErrorBoundary>
    </PluginContextProvider>
  );

  host.initialized = true;
  window.rootRefs = window.rootRefs || {};
  window.rootRefs[host.hostId] = host.rootRef;
  return true;
}

/** Unmounts and clears a host from memory and DOM scaffolding. */
function resetHost(hostId: HostId) {
  const host = hosts[hostId];
  const container = document.getElementById(hostId) as HTMLDivElement | null;
  const sr = container?.shadowRoot ?? host?.shadowRoot ?? null;

  try { host?.reactRoot?.unmount(); } catch {}
  if (sr) {
    const mount = sr.getElementById('boomi-root');
    if (mount) sr.removeChild(mount);
    sr.querySelectorAll('style[data-boomi-base], style[data-boomi-vars]').forEach((el) => el.remove());
  }
  if (hosts[hostId]) {
    hosts[hostId].reactRoot = null;
    hosts[hostId].rootRef = createRef<RootRef>();
    hosts[hostId].initialized = false;
    hosts[hostId].mountEl = null;
  }
}

/**
 * Destroys the plugin Shadow DOM and React tree, with optional cleanup behaviors.
 *
 * @public
 * @param opts - Optional cleanup options.
 * @param opts.hostId - Host element id to destroy. If omitted, destroys all mounted hosts.
 * @param opts.removeHost - If true, removes the host element from the DOM after reset/unmount.
 * @param opts.clearAuth - If true, dispatches a logout event and calls the server logout endpoint.
 *
 * @example
 * ```ts
 * DestroyPlugin({ removeHost: true, clearTheme: true, clearAuth: true });
 * ```
 */
export function DestroyPlugin(opts: {
  hostId?: HostId;
  removeHost?: boolean;
  clearAuth?: boolean; 
} = {}) {
  if (opts.clearAuth) {
    window.dispatchEvent(new CustomEvent('boomi:logout'));
    const serverBase = (pluginConfig?.serverBase || '/api/v1').replace(/\/$/, '');
    fetch(`${serverBase}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => undefined);
  }

  const destroyOne = (id: HostId) => {
    if (!document.getElementById(id)) return;
    resetHost(id);
    if (opts.removeHost) {
      const el = document.getElementById(id);
      if (el?.parentNode) el.parentNode.removeChild(el);
    }
    delete hosts[id];
  };

  if (opts.hostId) destroyOne(opts.hostId);
  else Object.keys(hosts).forEach(destroyOne);
}

/**
 * Stores the initial plugin configuration and (asynchronously) kicks off loading
 * of an external configuration file, if provided. Call this once before
 * {@link RenderComponent}.
 *
 * @public
 * @param config - The base plugin configuration.
 *
 * @example
 * ```ts
 * BoomiPlugin({
 *   apiBaseUrl: 'https://api.example.com',
 *   accountGroup: 'my-group',
 *   theme: { allowThemes: true, defaultTheme: 'boomi' },
 * });
 * ```
 */
export function BoomiPlugin(config: PluginConfig) {
  pluginConfig = config;
  logger.debug(
    `BoomiPlugin initialized with serverBase=${config?.serverBase} tenantId=${config?.tenantId}, and boomiConfig=${config?.boomiConfig ? 'provided' : 'not provided'}`
  );

  // Auth bootstrapping:
  if (config.accessToken && typeof window !== 'undefined') {
    window.__BoomiAccessToken = config.accessToken;
  }
  AuthManager.get().bootstrap({
    serverBase: config.serverBase || '/api/v1',
    tenantId: config.tenantId,
    nonce: config.nonce,
  });
}

/**
 * Stores the initial plugin configuration and (asynchronously) kicks off loading
 * of an external configuration file, if provided. Call this once before
 * {@link RenderComponent}.
 *
 * @public
 * @param config - The base plugin configuration.
 *
 * @example
 * ```ts
 * BoomiPlugin({
 *   apiBaseUrl: 'https://api.example.com',
 *   accountGroup: 'my-group',
 *   theme: { allowThemes: true, defaultTheme: 'boomi' },
 *   configFile: '/boomi.config.js'
 * });
 * ```
 */
export function RenderComponent<T extends ComponentName>({
  component,
  props,
  hostId = 'boomi',
  componentKey,
}: {
  component: T;
  props: MaybeWithKey<Parameters<(typeof componentMap)[T]>[0]>;
  hostId?: string;
  componentKey?: string;
}) {
  const container = document.getElementById(hostId) as HTMLDivElement | null;
  const keyFromAttr = container?.getAttribute('data-component-key') || undefined;
  const key = (props as any)?.componentKey ?? componentKey ?? keyFromAttr ?? 'integrationsMain';

  const attempt = async (retries: number) => {
    try {
      if (!pluginConfig) {
        logger.error('Plugin configuration not set before RenderComponent call.');
        return;
      }

      // stall the load until the plugin is initialized (auth exchange done)
      // this requires waiting for the token to actually be set. 
      await waitForAuthReady();

      const host = getOrCreateHost(hostId, key);
      if (!host) return;
      host.currentComponentName = component;

      const ok = await ensureRootMountedForHost(host);
      if (!ok) return;

      const ComponentToRender = componentMap[component] as React.ComponentType<any>;
      const Wrapped: React.ComponentType<any> = (Comp => {
        return function WrappedWithBoundary(p: any) {
          return (
            <ErrorBoundary>
              <Comp {...p} />
            </ErrorBoundary>
          );
        };
      })(ComponentToRender);

      const finalProps = ({ ...props, componentKey: key, __componentName: component } as any);

      if (host.rootRef.current?.updateComponent) {
        host.rootRef.current.updateComponent(Wrapped, finalProps, { forceRemount: true });
      } else if (retries > 0) {
        setTimeout(() => void attempt(retries - 1), 80);
      } else {
        logger.error('Failed to render component after retries.');
      }
    } catch (err) {
      logger.error('Render error:', err);
    }
  };

  void attempt(15);
}

export default BoomiPlugin;

/* ---------------------------
 * Public Embed (CDN auto-init)
 * --------------------------*/
export type PublicEmbedConfig = {
  publicToken: string;
  agentId: string;
  mountId?: string;
  serverBase?: string;   // e.g. https://host/api/v1
  origin?: string;
  userId?: string;
  userToken?: string;
  config?: Record<string, unknown>;
  autoInit?: boolean;
};

type PublicEmbedSessionResponse = {
  accessToken: string;
  tenantId: string;
  serverBase: string;
  agent: { agentId: string; boomiAgentId?: string; label?: string };
  config?: Record<string, unknown> | null;
};

function looksLikeFullBoomiConfig(cfg: any): boolean {
  if (!cfg || typeof cfg !== 'object') return false;
  return Boolean(
    (cfg as any).agents ||
    (cfg as any).theme ||
    (cfg as any).components ||
    (cfg as any).cssVars ||
    (cfg as any).cssVarsByTheme
  );
}

function buildPublicBoomiConfig(
  cfg: Record<string, unknown> | null | undefined,
  agentId: string,
  boomiAgentId?: string
) {
  const full = looksLikeFullBoomiConfig(cfg);
  const base = full ? (cfg as Record<string, unknown>) : {};
  const agents = (base as any).agents && typeof (base as any).agents === 'object'
    ? { ...(base as any).agents }
    : {};
  const fromFull = full ? (
    (agents[agentId] && typeof agents[agentId] === 'object')
      ? agents[agentId]
      : (boomiAgentId && agents[boomiAgentId] && typeof agents[boomiAgentId] === 'object')
        ? agents[boomiAgentId]
        : {}
  ) : {};
  const fromInline = !full && cfg && typeof cfg === 'object' ? cfg : {};
  const mergedAgentCfg = {
    ...fromInline,
    ...fromFull,
    ...(boomiAgentId ? { boomiAgentId } : {}),
    transport:
      (fromInline as any)?.transport ??
      (fromFull as any)?.transport ??
      'boomi-direct',
  };
  agents[agentId] = mergedAgentCfg;
  if (boomiAgentId && boomiAgentId !== agentId) {
    agents[boomiAgentId] = mergedAgentCfg;
  }
  return {
    ...base,
    agents,
  };
}

function ensureMount(mountId: string) {
  let el = document.getElementById(mountId);
  if (!el) {
    el = document.createElement('div');
    el.id = mountId;
    document.body.appendChild(el);
  }
  return el;
}

export async function BoomiPublicEmbed(cfg: PublicEmbedConfig) {
  if (!cfg || !cfg.publicToken || !cfg.agentId) {
    throw new Error('publicToken and agentId are required');
  }

  const serverBase = (cfg.serverBase || '/api/v1').replace(/\/$/, '');
  const origin = cfg.origin || (typeof window !== 'undefined' ? window.location.origin : undefined);
  const res = await fetch(`${serverBase}/embed/session`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicToken: cfg.publicToken,
      agentId: cfg.agentId,
      origin,
      userId: cfg.userId,
      userToken: cfg.userToken,
      config: cfg.config,
    }),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(msg || `Failed to create embed session (${res.status})`);
  }

  const data = (await res.json()) as PublicEmbedSessionResponse;
  if (!data?.accessToken) throw new Error('Embed session did not return accessToken');

  const mountId = cfg.mountId || 'boomi-agent';
  ensureMount(mountId);

  const boomiConfig = buildPublicBoomiConfig(data.config ?? undefined, cfg.agentId, data.agent?.boomiAgentId);
  const agentKey = data.agent?.boomiAgentId || cfg.agentId;
  const agentsCfg = ((boomiConfig as any).agents && typeof (boomiConfig as any).agents === 'object')
    ? { ...(boomiConfig as any).agents }
    : {};
  const baseAgentCfg = (agentsCfg[agentKey] && typeof agentsCfg[agentKey] === 'object')
    ? { ...(agentsCfg[agentKey] as Record<string, unknown>) }
    : {};
  const forcedAgentCfg = { ...baseAgentCfg, transport: 'boomi-direct' };
  agentsCfg[agentKey] = forcedAgentCfg;
  if (data.agent?.boomiAgentId && data.agent.boomiAgentId !== cfg.agentId) {
    agentsCfg[cfg.agentId] = forcedAgentCfg;
  }
  (boomiConfig as any).agents = agentsCfg;
  const accessToken = data.accessToken;
  const tenantId = data.tenantId;
  const base = (data.serverBase || serverBase || '/api/v1').replace(/\/$/, '');

  BoomiPlugin({
    serverBase: base,
    tenantId,
    nonce: '',
    accessToken,
    boomiConfig,
  });

  RenderComponent({
    component: 'Agent',
    hostId: mountId,
    componentKey: cfg.agentId,
    props: { integrationPackId: cfg.agentId },
  });
}

if (typeof window !== 'undefined') {
  const w = window as Window;
  const cfg = w.BoomiEmbed;
  if (cfg && cfg.autoInit !== false && !w.__BoomiPublicEmbedInitialized) {
    w.__BoomiPublicEmbedInitialized = true;
    BoomiPublicEmbed(cfg as PublicEmbedConfig).catch((err) => {
      logger.error('Public embed init failed:', err?.message || err);
    });
  }
}
