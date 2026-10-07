/**
 * @file ui-version.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Per-component UI versioning. `components[key].uiVersion` names the EmbedKit
 * release whose look and behavior that component should have, so upgrading the
 * package never changes an existing embed until the host opts in. Features that
 * change what users see are gated with `uiVersionAtLeast(..., '<release>')`; an
 * explicit per-feature setting in boomi.config.js always wins over the version.
 */

/** UI an existing embed gets when `uiVersion` is omitted: the last release before versioning. */
export const UI_VERSION_BASELINE = '1.6.1';

/** Releases whose UI changes are gated, newest last. */
export const UI_VERSIONS = {
  /** Add Integration catalog, connector icons and environment chip on cards, thin scrollbars. */
  CATALOG: '1.7.0',
} as const;

type Parts = [number, number, number];

/** Parses "1.7", "1.7.0" or "v1.7.0" into [major, minor, patch]; null if malformed. */
export function parseUiVersion(v: unknown): Parts | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const m = String(v).trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

export function compareUiVersions(a: Parts, b: Parts): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

const warned = new Set<string>();

/** The component's configured UI version, or the baseline when unset or malformed. */
export function resolveUiVersion(boomiConfig: any, componentKey: string): Parts {
  const raw = boomiConfig?.components?.[componentKey]?.uiVersion;
  if (raw === undefined || raw === null || raw === '') return parseUiVersion(UI_VERSION_BASELINE)!;
  const parsed = parseUiVersion(raw);
  if (!parsed) {
    const tag = `${componentKey}:${raw}`;
    if (!warned.has(tag)) {
      warned.add(tag);
      console.warn(
        `[EmbedKit] components.${componentKey}.uiVersion "${raw}" is not a version like "1.7.0"; using ${UI_VERSION_BASELINE}.`
      );
    }
    return parseUiVersion(UI_VERSION_BASELINE)!;
  }
  return parsed;
}

/** True when the component's UI version is at or after `release`. */
export function uiVersionAtLeast(boomiConfig: any, componentKey: string, release: string): boolean {
  return compareUiVersions(resolveUiVersion(boomiConfig, componentKey), parseUiVersion(release)!) >= 0;
}

/**
 * Shadow-root CSS for components on the 1.7 UI: thin scrollbars on every scroll
 * area. It is emitted ahead of the host's cssVars, so a host override of any
 * --boomi-scrollbar-* token still wins. The sheet lives in the component's shadow
 * root, so `*` never reaches the host page; its zero specificity lets
 * .boomi-scroll / .is-slim keep their per-element tuning.
 */
export const CATALOG_UI_CSS = `
:host{--boomi-scrollbar-width:8px;--boomi-scrollbar-thumb-inset:2px;--boomi-scrollbar-thumb-inset-hover:1px;--boomi-scrollbar-firefox-width:thin;--boomi-scrollbar-bg:transparent}
:host([data-theme="dark"]){--boomi-scrollbar-bg:transparent}
:host,*{scrollbar-width:var(--boomi-scrollbar-firefox-width,thin);scrollbar-color:var(--boomi-scrollbar-thumb) var(--boomi-scrollbar-bg)}
*::-webkit-scrollbar{width:var(--boomi-scrollbar-width);height:var(--boomi-scrollbar-width);background:transparent}
*::-webkit-scrollbar-track{background:var(--boomi-scrollbar-bg);border-radius:var(--boomi-scrollbar-radius)}
*::-webkit-scrollbar-thumb{background-color:var(--boomi-scrollbar-thumb);border-radius:var(--boomi-scrollbar-radius);border:var(--boomi-scrollbar-thumb-inset,2px) solid transparent;background-clip:content-box;min-height:2rem}
*::-webkit-scrollbar-thumb:hover{background-color:var(--boomi-scrollbar-thumb-hover);border-width:var(--boomi-scrollbar-thumb-inset-hover,1px)}
*::-webkit-scrollbar-thumb:active{background-color:var(--boomi-scrollbar-thumb-active)}
*::-webkit-scrollbar-corner{background:var(--boomi-scrollbar-corner)}
*::-webkit-scrollbar-button{display:none;width:0;height:0}
`;

/** Version-gated shadow-root CSS for a component, to prepend to its cssVars sheet. */
export function uiVersionCss(boomiConfig: any, componentKey: string): string {
  return uiVersionAtLeast(boomiConfig, componentKey, UI_VERSIONS.CATALOG) ? CATALOG_UI_CSS : '';
}
