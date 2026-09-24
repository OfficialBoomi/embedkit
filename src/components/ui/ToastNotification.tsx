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
import { slugifyHostId } from '../../utils/text';
import { injectToastStyles, removeToastStyles, resolveHost, readVar } from '../../utils/toastStyleBridge';

type ToastType = 'error' | 'warning' | 'success' | 'info' | 'question';

interface ToastNotificationProps {
  /** The semantic type of toast — selects the default icon and color set. */
  type: ToastType;
  /** The message displayed in the toast. */
  content: string;
}

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

const ToastNotification: React.FC<ToastNotificationProps> = ({ type, content }) => {
  const { boomiConfig, hostId } = usePlugin();
  const hostSlug = slugifyHostId(hostId);
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
    // Width goes through Swal's own `width` option (not forced CSS) so the
    // toast's grid/icon geometry stays intact.
    const width = readVar(computed, '--boomi-toast-width', '600px');

    const Toast = Swal.mixin({
      toast: true,
      position,
      width,
      iconColor,
      background,
      color,
      showConfirmButton: false,
      timer,
      timerProgressBar: Boolean(timer),
      customClass: {
        container: `boomi-toast boomi-toast--${hostSlug}`,
        popup: 'boomi-toast-popup',
        title: 'boomi-toast-title',
        timerProgressBar: 'boomi-toast-progress',
      },
      didOpen: (toast) => {
        injectToastStyles(anchorRef.current, hostSlug);
        // Pause the auto-dismiss timer while hovered.
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
      },
      didClose: () => removeToastStyles(hostSlug),
    });

    Toast.fire({
      icon: type,
      title: content,
    });
  }, [type, content, boomiConfig, hostSlug]);

  // Hidden anchor — gives us a node to walk up to the Shadow root.
  return <span ref={anchorRef} style={{ display: 'none' }} aria-hidden="true" />;
};

export default ToastNotification;
