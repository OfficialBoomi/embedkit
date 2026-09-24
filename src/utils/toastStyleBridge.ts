/**
 * @file toastStyleBridge.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Shared Shadow-DOM style bridge for SweetAlert2 toast notifications. See
 * `swalStyleBridge.ts` for the full rationale (Shadow DOM boundary, per-host
 * scoping) — this is the toast-specific counterpart, used by
 * `ToastNotification.tsx`. Kept in its own module (rather than exported from
 * the component file) so importing it doesn't pull in a React component /
 * break Fast Refresh.
 */

export type ResolvedHost = { host: HTMLElement; computed: CSSStyleDeclaration };

const TOAST_STYLE_ATTR = 'data-boomi-toast-vars';
// Shared, ref-counted consuming-rules block — see swalStyleBridge.ts for the
// identical rationale (per-host var scoping, shared static rule text).
const TOAST_RULES_ATTR = 'data-boomi-toast-rules';
const activeToastHosts = new Set<string>();

/**
 * Box-model / typography vars consumed by the injected `.boomi-toast-*` CSS
 * rules. These must be re-declared in document scope (outside Shadow DOM)
 * because the toast popup is rendered on `document.body`.
 */
export const TOAST_CSS_VAR_NAMES = [
  '--boomi-toast-radius',
  '--boomi-toast-shadow',
  '--boomi-toast-border',
  '--boomi-toast-title-fg',
  '--boomi-toast-progress-bar',
  '--boomi-dialog-font',
  '--boomi-toast-font',
  '--boomi-toast-font-size',
  '--boomi-toast-font-weight',
  '--boomi-toast-line-height',
  '--boomi-toast-padding',
  '--boomi-toast-min-height',
  '--boomi-toast-icon-size',
  '--boomi-toast-progress-display',
];

/** Resolve the Shadow host + its computed style from a hidden anchor element. */
export function resolveHost(anchor: HTMLElement | null): ResolvedHost | null {
  const root = anchor?.getRootNode();
  if (!(root instanceof ShadowRoot)) return null;
  const host = root.host as HTMLElement;
  return { host, computed: getComputedStyle(host) };
}

export function readVar(computed: CSSStyleDeclaration | null, name: string, fallback = ''): string {
  if (!computed) return fallback;
  const value = computed.getPropertyValue(name).trim();
  return value || fallback;
}

/** Recursively collect `.boomi-toast-*` style rules from a Shadow DOM stylesheet. */
function collectToastRules(ruleList: CSSRuleList, out: string[]): void {
  for (let i = 0; i < ruleList.length; i++) {
    const rule = ruleList[i];
    if (rule instanceof CSSStyleRule) {
      if (rule.selectorText.includes('boomi-toast')) out.push(rule.cssText);
    } else if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
      collectToastRules((rule as CSSGroupingRule).cssRules, out);
    }
  }
}

/**
 * Extract `.boomi-toast-*` rules from the Shadow DOM and inject them into
 * `document.head` alongside the resolved `--boomi-toast-*` values, so the
 * document-scoped toast popup picks up the active theme.
 *
 * `hostSlug` scopes the var-declaration block to this mount's own
 * `.boomi-toast--<hostSlug>` class so two EmbedKit mounts on one page with
 * different themes don't stomp or strip each other's toast styling.
 */
export function injectToastStyles(anchor: HTMLElement | null, hostSlug: string): void {
  // Only clear this host's own previous var-decl block, never another mount's.
  document.head.querySelectorAll(`style[${TOAST_STYLE_ATTR}="${hostSlug}"]`).forEach((el) => el.remove());

  const resolved = resolveHost(anchor);
  if (!resolved) return;
  const { host, computed } = resolved;

  // Shared consuming-rules block (identical text across mounts) — injected
  // once, ref-counted.
  activeToastHosts.add(hostSlug);
  if (!document.head.querySelector(`style[${TOAST_RULES_ATTR}]`)) {
    const ruleChunks: string[] = [];
    host.shadowRoot?.querySelectorAll('style').forEach((styleEl) => {
      if (!styleEl.sheet) return;
      try {
        collectToastRules(styleEl.sheet.cssRules, ruleChunks);
      } catch {
        // cross-origin sheet — skip
      }
    });
    if (ruleChunks.length > 0) {
      const rulesStyle = document.createElement('style');
      rulesStyle.setAttribute(TOAST_RULES_ATTR, 'true');
      rulesStyle.textContent = ruleChunks.join('\n');
      document.head.appendChild(rulesStyle);
    }
  }

  const varDecls = TOAST_CSS_VAR_NAMES.map((name) => {
    const value = computed.getPropertyValue(name).trim();
    return value ? `  ${name}: ${value};` : '';
  })
    .filter(Boolean)
    .join('\n');

  if (!varDecls) return;

  const style = document.createElement('style');
  style.setAttribute(TOAST_STYLE_ATTR, hostSlug);
  style.textContent = `.swal2-container.boomi-toast--${hostSlug} {\n${varDecls}\n}`;
  document.head.appendChild(style);
}

export function removeToastStyles(hostSlug: string): void {
  document.head.querySelectorAll(`style[${TOAST_STYLE_ATTR}="${hostSlug}"]`).forEach((el) => el.remove());
  activeToastHosts.delete(hostSlug);
  if (activeToastHosts.size === 0) {
    document.head.querySelectorAll(`style[${TOAST_RULES_ATTR}]`).forEach((el) => el.remove());
  }
}
