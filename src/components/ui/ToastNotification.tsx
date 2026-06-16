/**
 * @file ToastNotification.tsx
 * @component ToastNotification
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a SweetAlert2 toast notification. Every visual and behavioral aspect
 * (per-type background / foreground / icon color, position, width, timer,
 * border radius, padding, shadow, border, typography and progress-bar color) is
 * driven by `--boomi-toast-*` CSS custom properties so it is fully themeable via
 * boomi.config.js (cssVars / cssVarsByTheme / cssVarsByKey), exactly like the
 * other boomi components.
 *
 * Because SweetAlert2 renders toasts on `document.body` — outside the plugin's
 * Shadow DOM — the relevant `--boomi-toast-*` values are resolved from the
 * shadow host and either passed to Swal as options (colors/position/timer) or
 * re-declared in document scope so the injected `.boomi-toast-*` rules resolve.
 *
 * @return {JSX.Element} A hidden anchor used to locate the Shadow root.
 */

import { useEffect, useRef } from 'react';
import Swal from 'sweetalert2';
import type { SweetAlertPosition } from 'sweetalert2';
import { usePlugin } from '../../context/pluginContext';

type ToastType = 'error' | 'warning' | 'success' | 'info' | 'question';

interface ToastNotificationProps {
  /** The semantic type of toast — selects the default icon and color set. */
  type: ToastType;
  /** The message displayed in the toast. */
  content: string;
}

const TOAST_STYLE_ATTR = 'data-boomi-toast-vars';

/**
 * Box-model / typography vars consumed by the injected `.boomi-toast-*` CSS
 * rules. These must be re-declared in document scope (outside Shadow DOM)
 * because the toast popup is rendered on `document.body`.
 */
const TOAST_CSS_VAR_NAMES = [
  '--boomi-toast-width',
  '--boomi-toast-radius',
  '--boomi-toast-padding',
  '--boomi-toast-shadow',
  '--boomi-toast-border',
  '--boomi-toast-font-size',
  '--boomi-toast-font-family',
  '--boomi-toast-title-fg',
  '--boomi-toast-progress-bar',
];

/** Hard fallbacks so the toast still renders if no theme vars are present. */
const FALLBACK_COLORS: Record<ToastType, { bg: string; fg: string; icon: string }> = {
  success: { bg: '#22c55e', fg: '#ffffff', icon: '#ffffff' },
  error: { bg: '#ef4444', fg: '#ffffff', icon: '#ffffff' },
  warning: { bg: '#fde047', fg: '#000000', icon: '#000000' },
  info: { bg: '#3b82f6', fg: '#ffffff', icon: '#ffffff' },
  question: { bg: '#4b5563', fg: '#ffffff', icon: '#ffffff' },
};

const FALLBACK_POSITION: SweetAlertPosition = 'top';
const FALLBACK_TIMER = 2000;

function readVar(computed: CSSStyleDeclaration | null, name: string, fallback = ''): string {
  if (!computed) return fallback;
  const value = computed.getPropertyValue(name).trim();
  return value || fallback;
}

/** Resolve the Shadow host + its computed style from a hidden anchor element. */
function resolveHost(anchor: HTMLElement | null): { host: HTMLElement; computed: CSSStyleDeclaration } | null {
  const root = anchor?.getRootNode();
  if (!(root instanceof ShadowRoot)) return null;
  const host = root.host as HTMLElement;
  return { host, computed: getComputedStyle(host) };
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
 */
function injectToastStyles(anchor: HTMLElement | null): void {
  removeToastStyles();

  const resolved = resolveHost(anchor);
  if (!resolved) return;
  const { host, computed } = resolved;

  const cssChunks: string[] = [];

  host.shadowRoot?.querySelectorAll('style').forEach((styleEl) => {
    if (!styleEl.sheet) return;
    try {
      const rules: string[] = [];
      collectToastRules(styleEl.sheet.cssRules, rules);
      cssChunks.push(...rules);
    } catch {
      // cross-origin sheet — skip
    }
  });

  const varDecls = TOAST_CSS_VAR_NAMES.map((name) => {
    const value = computed.getPropertyValue(name).trim();
    return value ? `  ${name}: ${value};` : '';
  })
    .filter(Boolean)
    .join('\n');

  if (varDecls) cssChunks.push(`.swal2-container.boomi-toast {\n${varDecls}\n}`);
  if (cssChunks.length === 0) return;

  const style = document.createElement('style');
  style.setAttribute(TOAST_STYLE_ATTR, 'true');
  style.textContent = cssChunks.join('\n');
  document.head.appendChild(style);
}

function removeToastStyles(): void {
  document.head.querySelectorAll(`style[${TOAST_STYLE_ATTR}]`).forEach((el) => el.remove());
}

const ToastNotification: React.FC<ToastNotificationProps> = ({ type, content }) => {
  const { boomiConfig } = usePlugin();
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const resolved = resolveHost(anchorRef.current);
    const computed = resolved?.computed ?? null;
    const fb = FALLBACK_COLORS[type];

    // Colors, position and timer are Swal JS options (not CSS), so read the
    // resolved var values up front and feed them in.
    const background = readVar(computed, `--boomi-toast-${type}-bg`, fb.bg);
    const color = readVar(computed, `--boomi-toast-${type}-fg`, fb.fg);
    const iconColor = readVar(computed, `--boomi-toast-${type}-icon`, fb.icon);
    const position = readVar(computed, '--boomi-toast-position', FALLBACK_POSITION) as SweetAlertPosition;
    const timerRaw = Number(readVar(computed, '--boomi-toast-timer', String(FALLBACK_TIMER)));
    const timer = Number.isFinite(timerRaw) && timerRaw > 0 ? timerRaw : undefined;

    const Toast = Swal.mixin({
      toast: true,
      position,
      iconColor,
      background,
      color,
      showConfirmButton: false,
      timer,
      timerProgressBar: Boolean(timer),
      customClass: {
        container: 'boomi-toast',
        popup: 'boomi-toast-popup',
        title: 'boomi-toast-title',
        timerProgressBar: 'boomi-toast-progress',
      },
      didOpen: (toast) => {
        injectToastStyles(anchorRef.current);
        // Pause the auto-dismiss timer while hovered.
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
      },
      didClose: removeToastStyles,
    });

    Toast.fire({
      icon: type,
      title: content,
    });
  }, [type, content, boomiConfig]);

  // Hidden anchor — gives us a node to walk up to the Shadow root.
  return <span ref={anchorRef} style={{ display: 'none' }} aria-hidden="true" />;
};

export default ToastNotification;
