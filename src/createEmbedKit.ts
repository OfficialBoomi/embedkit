/**
 * @file createEmbedKit.ts
 * @function createEmbedKit
 * @license BSD-2-Clause
 * @description
 * Builds a sane PluginConfig with a simple precedence:
 * explicit overrides → window.boomiConfig → #boomi-config JSON → defaults.
 */

import type { PluginConfig } from './types/plugin.config';

function readConfigFromScriptTag(): Partial<PluginConfig> | null {
  try {
    const el = document.getElementById('boomi-config');
    if (!el?.textContent) return null;
    return JSON.parse(el.textContent.trim());
  } catch {
    return null;
  }
}

export function createEmbedKit(overrides: Partial<PluginConfig> = {}): PluginConfig {
  const fromWin = (window as any).boomiConfig as Partial<PluginConfig> | undefined;
  const fromScript = readConfigFromScriptTag() || undefined;

  // super-light deep merge
  const merge = <T extends object>(a: T, b?: Partial<T>): T => {
    if (!b) return a;
    const out: any = Array.isArray(a) ? [...(a as any)] : { ...(a as any) };
    for (const [k, v] of Object.entries(b)) {
      const cur = (out as any)[k];
      (out as any)[k] =
        v && typeof v === 'object' && !Array.isArray(v)
          ? merge(cur || {}, v as any)
          : v;
    }
    return out;
  };

  const defaults: PluginConfig = {
    serverBase: 'https://api.boomi.com/partner/api/rest/v1',
    tenantId: '',
    nonce: '',
  } as PluginConfig;

  return merge(merge(merge(defaults, fromWin), fromScript), overrides);
}
