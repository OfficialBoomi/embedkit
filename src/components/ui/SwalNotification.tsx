/**
 * @file SwalNotification.tsx
 * @component SwalNotification
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders a SweetAlert2 notification modal with customizable title, description,
 * type (error, warning, success), and optional confirm/cancel actions.
 * Supports configuration for closing behavior, timers, and button text.
 *
 * @return {JSX.Element} The rendered SweetAlert2 notification component.
 */

import { useEffect, useRef } from 'react';
import Swal, { SweetAlertResult } from 'sweetalert2';

/**
 * @interface SwalNotificationProps
 *
 * @description
 * Props for the `SwalNotification` component.
 *
 * @property {'error' | 'warning' | 'success'} type - The type of notification.
 * @property {string} title - The main title text displayed in the notification.
 * @property {string} description - Detailed description displayed below the title.
 * @property {boolean} showCancel - Whether to display a cancel button.
 * @property {string} [confirmButtonText='OK'] - Optional label text for the confirm button.
 * @property {string} [cancelButtonText='Cancel'] - Optional label text for the cancel button.
 * @property {() => void} [onConfirm] - Callback invoked when the confirm button is clicked.
 * @property {() => void} [onCancel] - Callback invoked when the cancel button is clicked.
 * @property {boolean} [allowOutsideClick=true] - Whether clicking outside the modal closes it.
 * @property {boolean} [allowEscapeKey=true] - Whether pressing the Escape key closes the modal.
 * @property {number} [timerMs] - Optional timer in milliseconds to auto-close the notification.
 */
interface SwalNotificationProps {
  type: 'error' | 'warning' | 'success';
  title: string;
  description: string;
  showCancel: boolean;
  confirmButtonText?: string;
  cancelButtonText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  allowOutsideClick?: boolean;
  allowEscapeKey?: boolean;
  timerMs?: number;
}

const SWAL_STYLE_ATTR = 'data-boomi-swal-vars';

// CSS custom properties consumed by the boomi-swal rules that must be
// resolved and re-declared in document scope (outside Shadow DOM).
const SWAL_VAR_NAMES = [
  '--boomi-swal-bg',
  '--boomi-swal-fg',
  '--boomi-swal-border',
  '--boomi-swal-shadow',
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

// Extracts swal CSS rules from the Shadow DOM and injects them into
// document.head alongside resolved --boomi-* custom property values so that
// Swal popups (rendered on document.body) pick up the active theme.
function injectSwalStyles(anchor: HTMLElement | null): void {
  document.head.querySelectorAll(`style[${SWAL_STYLE_ATTR}]`).forEach((el) => el.remove());

  const root = anchor?.getRootNode();
  if (!(root instanceof ShadowRoot)) return;

  const host = root.host as HTMLElement;
  const computed = getComputedStyle(host);
  const cssChunks: string[] = [];

  // 1. Extract swal-related CSS rules from every shadow DOM stylesheet.
  root.querySelectorAll('style').forEach((styleEl) => {
    if (!styleEl.sheet) return;
    try {
      const rules: string[] = [];
      collectSwalRules(styleEl.sheet.cssRules, rules);
      cssChunks.push(...rules);
    } catch {
      // cross-origin sheet — skip
    }
  });

  // 2. Resolve all --boomi-* vars from the shadow host and re-declare them on
  //    the swal container so the rules extracted above can consume them.
  const varDecls = SWAL_VAR_NAMES.map((name) => {
    const value = computed.getPropertyValue(name).trim();
    return value ? `  ${name}: ${value};` : '';
  })
    .filter(Boolean)
    .join('\n');

  if (varDecls) {
    cssChunks.push(`.swal2-container.boomi-swal {\n${varDecls}\n}`);
  }

  if (cssChunks.length === 0) return;

  const style = document.createElement('style');
  style.setAttribute(SWAL_STYLE_ATTR, 'true');
  style.textContent = cssChunks.join('\n');
  document.head.appendChild(style);
}

function removeSwalStyles(): void {
  document.head.querySelectorAll(`style[${SWAL_STYLE_ATTR}]`).forEach((el) => el.remove());
}

const SwalNotification: React.FC<SwalNotificationProps> = ({
  type,
  title,
  description,
  showCancel,
  confirmButtonText = 'OK',
  cancelButtonText = 'Cancel',
  onConfirm,
  onCancel,
  allowOutsideClick = true,
  allowEscapeKey = true,
  timerMs,
}) => {
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    Swal.fire({
      icon: type,
      title,
      text: description,
      showCancelButton: showCancel,
      confirmButtonText,
      cancelButtonText,
      allowOutsideClick,
      allowEscapeKey,
      timer: timerMs,
      timerProgressBar: Boolean(timerMs),
      customClass: {
        container: 'boomi-swal',
        popup: 'boomi-swal-popup',
        confirmButton: 'swal2-confirm',
        cancelButton: 'swal2-cancel',
        actions: 'boomi-swal-actions',
      },
      showClass: { popup: 'swal2-show boomi-swal-in' },
      hideClass: { popup: 'swal2-hide boomi-swal-out' },
      didOpen: () => injectSwalStyles(anchorRef.current),
      didClose: removeSwalStyles,
    }).then((result: SweetAlertResult) => {
      if (result.isConfirmed) {
        onConfirm?.();
      } else if (result.isDenied || result.isDismissed) {
        onCancel?.();
      }
    });
  }, [
    type,
    title,
    description,
    showCancel,
    confirmButtonText,
    cancelButtonText,
    allowOutsideClick,
    allowEscapeKey,
    timerMs,
    onConfirm,
    onCancel,
  ]);

  // Hidden anchor element — gives us a reference point to walk up to the
  // Shadow root so we can read the boomi CSS var block.
  return <span ref={anchorRef} style={{ display: 'none' }} aria-hidden="true" />;
};

export default SwalNotification;
