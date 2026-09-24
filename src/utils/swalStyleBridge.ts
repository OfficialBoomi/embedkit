/**
 * @file swalStyleBridge.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Shared Shadow-DOM style bridge for SweetAlert2 confirm/alert dialogs.
 * EmbedKit's React tree lives in an open Shadow DOM, but Swal.fire() renders
 * on document.body — outside it — so CSS custom properties set on the
 * shadow host never reach the popup on their own. This module extracts the
 * `.boomi-swal ...` consuming rules from the shadow root's stylesheets and
 * re-declares the resolved `--boomi-*` values in document scope so the popup
 * picks up the active theme.
 *
 * Used by both `SwalNotification.tsx` (the themed confirm/alert component)
 * and `RedisAdmin.tsx` (admin console dialogs) so there is exactly one style
 * bridge implementation, not two divergent copies. Kept in its own module
 * (rather than exported from SwalNotification.tsx) so importing it doesn't
 * pull in a React component / break Fast Refresh.
 *
 * `hostSlug` (see `slugifyHostId`) scopes the injected var-declaration block
 * to this mount's own `.boomi-swal--<hostSlug>` class (also added to the
 * fired dialog's `customClass.container`) so two EmbedKit mounts on one page
 * with different themes don't stomp or strip each other's dialog styling.
 */

const SWAL_STYLE_ATTR = 'data-boomi-swal-vars';
// Shared, ref-counted consuming-rules block (identical text regardless of
// which host mount injects it) — kept alive as long as any mount has an
// open dialog, so N mounts opening/closing don't churn duplicate <style>s.
const SWAL_RULES_ATTR = 'data-boomi-swal-rules';
const activeSwalHosts = new Set<string>();

// CSS custom properties consumed by the boomi-swal rules that must be
// resolved and re-declared in document scope (outside Shadow DOM).
export const SWAL_VAR_NAMES = [
  '--boomi-swal-bg',
  '--boomi-swal-fg',
  '--boomi-swal-border',
  '--boomi-swal-shadow',
  '--boomi-swal-title-fg',
  '--boomi-swal-desc-fg',
  '--boomi-swal-overlay-bg',
  '--boomi-swal-icon-success',
  '--boomi-swal-icon-warning',
  '--boomi-swal-icon-error',
  '--boomi-dialog-font',
  '--boomi-swal-title-font-size',
  '--boomi-swal-title-font-weight',
  '--boomi-swal-desc-font-size',
  '--boomi-swal-border-radius',
  '--boomi-swal-padding',
  '--boomi-swal-actions-gap',
  '--boomi-spinner-overlay-bg',
  '--boomi-spinner-overlay-blur',
  '--boomi-update-title-fg',
  '--boomi-modal-fg',
  '--boomi-update-desc-fg',
  '--boomi-input-shadow-focus',
  '--boomi-btn-primary-bg',
  '--boomi-btn-primary-fg',
  '--boomi-btn-primary-border',
  '--boomi-btn-primary-shadow',
  '--boomi-btn-primary-bg-hover',
  '--boomi-btn-primary-bg-active',
  '--boomi-btn-secondary-bg',
  '--boomi-btn-secondary-fg',
  '--boomi-btn-secondary-border',
  '--boomi-btn-secondary-shadow',
  '--boomi-btn-secondary-bg-hover',
  '--boomi-btn-secondary-bg-active',
  '--boomi-btn-danger-bg',
  '--boomi-btn-danger-fg',
  '--boomi-btn-danger-border',
  '--boomi-btn-danger-shadow',
  '--boomi-btn-danger-bg-hover',
  '--boomi-btn-danger-bg-active',
  '--boomi-notice-success-fg',
  '--boomi-notice-warning-fg',
  '--boomi-notice-error-fg',
  '--boomi-accent',
];

// Walk a CSSRuleList recursively and collect rules whose selectors mention
// boomi-swal / swal2-container, plus boomi-swal keyframe animations.
function collectSwalRules(ruleList: CSSRuleList, out: string[]): void {
  for (let i = 0; i < ruleList.length; i++) {
    const rule = ruleList[i];
    if (rule instanceof CSSStyleRule) {
      if (
        rule.selectorText.includes('boomi-swal') ||
        rule.selectorText.includes('swal2-container')
      ) {
        out.push(rule.cssText);
      }
    } else if (rule instanceof CSSKeyframesRule) {
      if (rule.name.includes('boomi-swal')) {
        out.push(rule.cssText);
      }
    } else if ('cssRules' in rule && (rule as CSSGroupingRule).cssRules) {
      // Recurse into @layer, @media, @supports, etc.
      collectSwalRules((rule as CSSGroupingRule).cssRules, out);
    }
  }
}

/**
 * Extracts swal CSS rules from the Shadow DOM and injects them into
 * document.head alongside resolved --boomi-* custom property values so that
 * Swal popups (rendered on document.body) pick up the active theme.
 */
export function injectSwalStyles(anchor: HTMLElement | null, hostSlug: string): void {
  // Only clear this host's own previous var-decl block (idempotent re-open),
  // never another mount's.
  document.head.querySelectorAll(`style[${SWAL_STYLE_ATTR}="${hostSlug}"]`).forEach((el) => el.remove());

  const root = anchor?.getRootNode();
  if (!(root instanceof ShadowRoot)) return;

  const host = root.host as HTMLElement;
  const computed = getComputedStyle(host);

  // 1. Extract swal-related CSS rules from every shadow DOM stylesheet. This
  //    text is identical across mounts (it's the same static main.css rules),
  //    so it's injected once into a shared block and ref-counted.
  activeSwalHosts.add(hostSlug);
  if (!document.head.querySelector(`style[${SWAL_RULES_ATTR}]`)) {
    const ruleChunks: string[] = [];
    root.querySelectorAll('style').forEach((styleEl) => {
      if (!styleEl.sheet) return;
      try {
        collectSwalRules(styleEl.sheet.cssRules, ruleChunks);
      } catch {
        // cross-origin sheet — skip
      }
    });
    if (ruleChunks.length > 0) {
      const rulesStyle = document.createElement('style');
      rulesStyle.setAttribute(SWAL_RULES_ATTR, 'true');
      rulesStyle.textContent = ruleChunks.join('\n');
      document.head.appendChild(rulesStyle);
    }
  }

  // 2. Resolve all --boomi-* vars from the shadow host and re-declare them,
  //    scoped to this host's own container class.
  const varDecls = SWAL_VAR_NAMES.map((name) => {
    const value = computed.getPropertyValue(name).trim();
    return value ? `  ${name}: ${value};` : '';
  })
    .filter(Boolean)
    .join('\n');

  if (!varDecls) return;

  const style = document.createElement('style');
  style.setAttribute(SWAL_STYLE_ATTR, hostSlug);
  style.textContent = `.swal2-container.boomi-swal--${hostSlug} {\n${varDecls}\n}`;
  document.head.appendChild(style);
}

export function removeSwalStyles(hostSlug: string): void {
  document.head.querySelectorAll(`style[${SWAL_STYLE_ATTR}="${hostSlug}"]`).forEach((el) => el.remove());
  activeSwalHosts.delete(hostSlug);
  if (activeSwalHosts.size === 0) {
    document.head.querySelectorAll(`style[${SWAL_RULES_ATTR}]`).forEach((el) => el.remove());
  }
}
