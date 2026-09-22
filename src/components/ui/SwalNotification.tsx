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
import { usePlugin } from '../../context/pluginContext';
import { slugifyHostId } from '../../utils/text';
import { injectSwalStyles, removeSwalStyles } from '../../utils/swalStyleBridge';

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
  const { hostId, boomiConfig } = usePlugin();
  const hostSlug = slugifyHostId(hostId);
  const dialogsCfg = boomiConfig?.dialogs;
  // Defaults below match today's behavior exactly (AC #5): cancel-first order,
  // icon shown, primary-colored confirm button.
  const reverseButtons = dialogsCfg?.buttonOrder === 'confirm-first';
  const showIcon = dialogsCfg?.showIcon !== false;
  const isDestructive = Boolean(dialogsCfg?.destructiveVariant) && type === 'warning';

  useEffect(() => {
    Swal.fire({
      icon: showIcon ? type : undefined,
      title,
      text: description,
      showCancelButton: showCancel,
      reverseButtons,
      confirmButtonText,
      cancelButtonText,
      allowOutsideClick,
      allowEscapeKey,
      timer: timerMs,
      timerProgressBar: Boolean(timerMs),
      customClass: {
        container: `boomi-swal boomi-swal--${hostSlug}`,
        popup: 'boomi-swal-popup',
        confirmButton: isDestructive ? 'swal2-confirm swal2-confirm--danger' : 'swal2-confirm',
        cancelButton: 'swal2-cancel',
        actions: 'boomi-swal-actions',
      },
      showClass: { popup: 'swal2-show boomi-swal-in' },
      hideClass: { popup: 'swal2-hide boomi-swal-out' },
      didOpen: () => injectSwalStyles(anchorRef.current, hostSlug),
      didClose: () => removeSwalStyles(hostSlug),
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
    hostSlug,
    reverseButtons,
    showIcon,
    isDestructive,
  ]);

  // Hidden anchor element — gives us a reference point to walk up to the
  // Shadow root so we can read the boomi CSS var block.
  return <span ref={anchorRef} style={{ display: 'none' }} aria-hidden="true" />;
};

export default SwalNotification;
