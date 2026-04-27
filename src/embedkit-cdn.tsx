/**
 * @file embedkit-cdn.tsx
 * Minimal public embed entry for CDN usage.
 * Includes only the Agent component and auto-init logic.
 */
import AuthManager from './security/authManager';
import React, { createRef } from 'react';
import ReactDOM from 'react-dom/client';
import PluginContextProvider from './context/pluginContext';
import Root from './components/Root';
import ErrorBoundary from './components/ErrorBoundary';
import tailwindCss from './main.css?inline';
import logger from './logger.service';

import Agent from './components/agent/Agent';
import AgentTiles from './components/agent/AgentTiles';
import AgentListLauncher from './components/agent/AgentListLauncher';

import type { BoundRender } from './types/plugin-context';
import type { PluginConfig } from './types/plugin.config';
import type { RootRef } from './components/Root';

export const componentMap = {
  Agent,
  AgentTiles,
  AgentListLauncher,
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

let pluginConfig: PluginConfig | null = null;

declare global {
  interface Window {
    BoomiEmbed?: PublicEmbedConfig | PublicEmbedConfig[];
    __BoomiInitializedMounts?: Set<string>;
    __BoomiAccessToken?: string;
    rootRefs?: Record<string, React.RefObject<RootRef | null>>;
  }
}

const hosts: Record<HostId, HostRecord> = {};

async function waitForAuthReady() {
  await AuthManager.get().ensureReady();
}

function toVarName(key: string, prefix = '--boomi-show-') {
  const kebab = key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
  return `${prefix}${kebab}`;
}

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
    const xVal = toCssVal((offsetCfg as any).offsetX ?? (offsetCfg as any).x ?? null);
    const yVal = toCssVal((offsetCfg as any).offsetY ?? (offsetCfg as any).y ?? null);
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

function getThemeForKey(cfg: PluginConfig | null, key: ComponentKey): string {
  if (!cfg) return 'base';
  const theme = (cfg as any).boomiConfig?.theme;
  if (!theme) return 'base';
  if (theme?.allowThemes === false) return 'base';
  return theme.defaultTheme || 'base';
}

function injectBaseStyles(shadowRoot: ShadowRoot) {
  if (shadowRoot.querySelector('style[data-boomi-base]')) return;
  const style = document.createElement('style');
  style.setAttribute('data-boomi-base', 'true');
  style.textContent = `
  ${tailwindCss}
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
  } else if (componentKey) {
    hosts[hostId].componentKey = componentKey;
  }

  return hosts[hostId];
}

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
  const isAgentModal = host.currentComponentName === 'Agent' && agentCfg?.ui?.mode === 'modal';

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

  injectBaseStyles(shadowRoot);
  applyBoomiConfigVars(shadowRoot, pluginConfig?.boomiConfig ?? pluginConfig, host.componentKey);

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

export function BoomiPlugin(config: PluginConfig) {
  pluginConfig = config;
  logger.debug(
    `BoomiPlugin initialized with serverBase=${config?.serverBase} tenantId=${config?.tenantId}, and boomiConfig=${config?.boomiConfig ? 'provided' : 'not provided'}`
  );

  if (config.accessToken && typeof window !== 'undefined') {
    window.__BoomiAccessToken = config.accessToken;
  }

  AuthManager.get().bootstrap({
    serverBase: config.serverBase || '/api/v1',
    tenantId: config.tenantId,
    nonce: config.nonce,
  });
}

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
  const key = (props as any)?.componentKey ?? componentKey ?? keyFromAttr ?? 'agent';

  const attempt = async (retries: number) => {
    try {
      if (!pluginConfig) {
        logger.error('Plugin configuration not set before RenderComponent call.');
        return;
      }

      await waitForAuthReady();

      const host = getOrCreateHost(hostId, key);
      if (!host) return;
      host.currentComponentName = component;

      const ok = await ensureRootMountedForHost(host);
      if (!ok) return;

      const ComponentToRender = componentMap[component] as React.ComponentType<any> | undefined;
      if (!ComponentToRender) {
        logger.error(`Component '${component}' not supported by embedkit-cdn.`);
        return;
      }

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

export type PublicEmbedConfig = {
  publicToken: string;
  agentId?: string;
  agentIds?: string[];
  mountId?: string;
  serverBase?: string;
  origin?: string;
  userId?: string;
  userToken?: string;
  config?: Record<string, unknown>;
  autoInit?: boolean;
  sessionScope?: 'mount' | 'multi';
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
    (cfg as any).cssVarsByTheme ||
    (cfg as any).project
  );
}

function normalizeEmbedType(input: unknown): 'single' | 'tiles' | 'list' | undefined {
  if (typeof input !== 'string') return undefined;
  const v = input.trim().toLowerCase();
  if (!v) return undefined;
  if (v === 'list' || v === 'pill' || v === 'multi-pill' || v === 'multipill') return 'list';
  if (v === 'tiles' || v === 'multi' || v === 'multi-tiles' || v === 'grid') return 'tiles';
  if (v === 'single') return 'single';
  return undefined;
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
  const fromFull = full ? (agents[agentId] && typeof agents[agentId] === 'object' ? agents[agentId] : {}) : {};
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
  if (!cfg || !cfg.publicToken) {
    throw new Error('publicToken is required');
  }
  const agentIds = Array.isArray(cfg.agentIds) ? cfg.agentIds.filter(Boolean) : [];
  const primaryAgentId = cfg.agentId || agentIds[0];
  if (!primaryAgentId) {
    throw new Error('agentId or agentIds is required');
  }

  const serverBase = (cfg.serverBase || '/api/v1').replace(/\/$/, '');
  const origin = cfg.origin || (typeof window !== 'undefined' ? window.location.origin : undefined);
  const res = await fetch(`${serverBase}/embed/session`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicToken: cfg.publicToken,
      agentId: primaryAgentId,
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

  const projectCfg =
    data.config && typeof data.config === 'object'
      ? (data.config as any).project
      : undefined;
  const projectAgentIds = Array.isArray(projectCfg?.agentIds)
    ? projectCfg.agentIds.filter(Boolean)
    : [];
  const resolvedAgentIds = agentIds.length > 0 ? agentIds : projectAgentIds;

  const boomiConfig = buildPublicBoomiConfig(
    data.config ?? undefined,
    primaryAgentId,
    data.agent?.boomiAgentId
  );
  const agentsCfg = ((boomiConfig as any).agents && typeof (boomiConfig as any).agents === 'object')
    ? { ...(boomiConfig as any).agents }
    : {};
  const hasAgentList = !!(boomiConfig as any)?.components?.agentList;
  const resolvedEmbedType =
    normalizeEmbedType(projectCfg?.embedType) ??
    (resolvedAgentIds.length > 0 ? (hasAgentList ? 'list' : 'tiles') : 'single');
  const useAgentList = resolvedEmbedType === 'list';
  const useTiles = resolvedEmbedType === 'tiles';
  const shouldUseMulti = (useAgentList || useTiles) && resolvedAgentIds.length > 0;
  const explicitAgents = new Set(Object.keys(agentsCfg));
  const idsToForce = shouldUseMulti ? resolvedAgentIds : [primaryAgentId];
  const shouldRestrictIds = useAgentList && explicitAgents.size > 0;
  const forceIds = shouldRestrictIds
    ? idsToForce.filter((id: string) => explicitAgents.has(id))
    : idsToForce;
  for (const id of forceIds) {
    const baseAgentCfg = (agentsCfg[id] && typeof agentsCfg[id] === 'object')
      ? { ...(agentsCfg[id] as Record<string, unknown>) }
      : {};
    const baseUi = (baseAgentCfg as any).ui && typeof (baseAgentCfg as any).ui === 'object'
      ? { ...(baseAgentCfg as any).ui }
      : {};
    const desiredSessionScope =
      (cfg.sessionScope as 'mount' | 'multi' | undefined) ??
      (baseUi as any).sessionScope ??
      'mount';
    agentsCfg[id] = {
      ...baseAgentCfg,
      transport: 'boomi-direct',
      ui: { ...baseUi, sessionScope: desiredSessionScope },
    };
  }
  if (data.agent?.boomiAgentId && data.agent.boomiAgentId !== primaryAgentId) {
    if (shouldRestrictIds && !explicitAgents.has(primaryAgentId)) {
      // In agent list mode, avoid creating config entries that weren't provided explicitly.
    } else {
    const baseAgentCfg = (agentsCfg[primaryAgentId] && typeof agentsCfg[primaryAgentId] === 'object')
      ? { ...(agentsCfg[primaryAgentId] as Record<string, unknown>) }
      : {};
    const baseUi = (baseAgentCfg as any).ui && typeof (baseAgentCfg as any).ui === 'object'
      ? { ...(baseAgentCfg as any).ui }
      : {};
    const desiredSessionScope =
      (cfg.sessionScope as 'mount' | 'multi' | undefined) ??
      (baseUi as any).sessionScope ??
      'mount';
    agentsCfg[data.agent.boomiAgentId] = {
      ...baseAgentCfg,
      transport: 'boomi-direct',
      ui: { ...baseUi, sessionScope: desiredSessionScope },
    };
    }
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

  AuthManager.get().setCustomRefresher(async () => {
    try {
      const r = await fetch(`${serverBase}/embed/session`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken: cfg.publicToken,
          agentId: primaryAgentId,
          origin,
          userId: cfg.userId,
          userToken: cfg.userToken,
          config: cfg.config,
        }),
      });
      if (!r.ok) return null;
      const d = await r.json().catch(() => ({}));
      return typeof d?.accessToken === 'string' ? d.accessToken : null;
    } catch { return null; }
  });

  const renderAgentIds = shouldUseMulti
    ? (shouldRestrictIds ? resolvedAgentIds.filter((id: string) => explicitAgents.has(id)) : resolvedAgentIds)
    : [];
  // When the list is configured for page mode, render tiles inline (no floating launcher button).
  const agentListPageMode = (boomiConfig as any)?.components?.agentList?.mode === 'page';
  const componentToRender =
    shouldUseMulti
      ? (useAgentList && !agentListPageMode ? 'AgentListLauncher' : 'AgentTiles')
      : 'Agent';

  RenderComponent({
    component: componentToRender as 'Agent' | 'AgentTiles' | 'AgentListLauncher',
    hostId: mountId,
    componentKey: shouldUseMulti ? mountId : primaryAgentId,
    props: shouldUseMulti ? { agentIds: renderAgentIds } : { integrationPackId: primaryAgentId },
  });
}

if (typeof window !== 'undefined') {
  const w = window as Window;
  const raw = w.BoomiEmbed;
  const cfgs = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  w.__BoomiInitializedMounts ??= new Set();
  for (const cfg of cfgs) {
    if (cfg.autoInit === false) continue;
    const key = `${cfg.publicToken}::${cfg.mountId ?? 'boomi-agent'}`;
    if (w.__BoomiInitializedMounts.has(key)) continue;
    w.__BoomiInitializedMounts.add(key);
    BoomiPublicEmbed(cfg).catch((err) => {
      logger.error('Public embed init failed:', err?.message || err);
    });
  }
}

export default BoomiPublicEmbed;
